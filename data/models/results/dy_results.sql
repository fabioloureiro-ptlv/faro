-- dy_results.sql: v3, resultado por teste x grao (usuario|sessao) x device x variante.
-- As exposicoes saem da dw_corporativo.ft_teste_ab (11/10/2026) em vez do ssot_ga4 cru: os mesmos
-- usuarios, ~6 GB em 45 dias no lugar de ~25. As compras continuam vindo do ssot_ga4. ~10 GB.
-- Mesma saída da v2 (02/10/2026): as colunas de antes seguem com os mesmos nomes e na mesma ordem; as novas
-- vão no fim. O resultado é o do último SELECT. Script com tabelas temporárias (sem elas o BigQuery recalcula
-- as CTEs a cada referência). Resumo das mudanças em MELHORIAS.md. Em uma linha cada:
--  Dado    1. "viu 2 variantes" e compra só até data_fim_leitura; variante = a primeira vista (corrige falso positivo
--             de teste encerrado). 2. Teto de outlier p0,1/p99,9 nas métricas em R$. 3. CUPED (receita/transações
--             dos cuped_dias antes da 1ª exposição) nas médias por usuário.
--  Freq.   4. Proporções com Agresti-Caffo (+1 sucesso e +1 fracasso por braço). 5. Uplift e IC em log-razão
--             (delta method), sem explodir com controle pequeno. 6. Dunnett para A/B/C. 7. Papel de cada métrica:
--             norte decide (z de Dunnett); guardas (conversão, margem 2) com Holm e alerta de dano; exploratórias
--             com Benjamini-Hochberg (FDR fdr_q). 8. Mínimo de eventos por métrica e de dias de leitura.
--             9. Split por qui-quadrado contra o planejado. 10. Variância por delta method nas razões (ticket).
--  Bayes. 11. Prior Normal(0; prior_dp) no log da razão (encolhe efeito exagerado de teste pequeno); posterior dá
--             uplift_esperado_, chance_melhor_, perda_ligar_/perda_manter_ e recomendacao_ (com veto das guardas e
--             "Sem diferença relevante" quando o IC inteiro cabe em ±rope).
--  Métricas novas: receita faturada, margem 2, clube (conversão, receita, churn), repet nova, saúde (conversão,
--  vidas, receita, ticket, churn), conversão para o carrinho.
-- Placeholders: overrides e linked como hoje; novos e opcionais: split (cfg_split) e norte (cfg_norte), no formato:
--   , STRUCT('<campanha>', '<variacao>', 0.25)        split planejado
--   , STRUCT('<campanha>', 'ticket')                  métrica norte (sem linha: receita_por_unidade)
-- O faturado chega com ~D+5: receita faturada e margem dos últimos dias ficam incompletas nos dois braços.
-- [Unificação Faro, 2026-10-15] Versionada como fonte da frente 4 (GET /results). Único ajuste sobre o
-- original: host 'www.petlove.com.br' restaurado (o paste havia virado link markdown).
DECLARE campanha_alvo STRING DEFAULT NULL; -- ex.: '[Ecom Fidelidade] TKM - Upsize de embalagem PDP - WEB'
DECLARE dias_janela INT64 DEFAULT 45;      -- quantos dias para trás buscar exposições
DECLARE d_fim DATE DEFAULT DATE_SUB(CURRENT_DATE('America/Sao_Paulo'), INTERVAL 1 DAY);
DECLARE d_ini DATE DEFAULT DATE_SUB(d_fim, INTERVAL dias_janela - 1 DAY);
DECLARE d_7 DATE DEFAULT DATE_SUB(d_fim, INTERVAL 6 DAY);
DECLARE cuped_dias INT64 DEFAULT 28;       -- pré-período do CUPED
DECLARE alfa FLOAT64 DEFAULT 0.05;         -- nível dos testes (norte e guardas)
DECLARE fdr_q FLOAT64 DEFAULT 0.10;        -- FDR das métricas exploratórias (Benjamini-Hochberg)
DECLARE min_eventos INT64 DEFAULT 30;      -- eventos mínimos por braço para ler uma métrica
DECLARE dias_minimos INT64 DEFAULT 7;      -- dias mínimos de leitura (um ciclo semanal)
DECLARE prior_dp FLOAT64 DEFAULT 0.03;     -- desvio do prior do efeito (log da razão ~ uplift relativo)
DECLARE limiar_perda FLOAT64 DEFAULT 0.001; -- perda esperada aceitável para recomendar (0,1% da métrica)
DECLARE rope FLOAT64 DEFAULT 0.02;         -- zona de equivalência: IC inteiro dentro de ±2% = sem diferença relevante
-- Φ(z): normal acumulada (Abramowitz-Stegun 26.2.17, erro < 1e-7); dnorm(z): densidade normal
CREATE TEMP FUNCTION phi(z FLOAT64) AS (
  IF(z >= 0,
     1 - 0.3989423 * EXP(-z*z/2) * (1/(1+0.2316419*ABS(z))) * (0.3193815 + (1/(1+0.2316419*ABS(z)))*(-0.3565638 + (1/(1+0.2316419*ABS(z)))*(1.781478 + (1/(1+0.2316419*ABS(z)))*(-1.821256 + (1/(1+0.2316419*ABS(z)))*1.330274)))),
     0.3989423 * EXP(-z*z/2) * (1/(1+0.2316419*ABS(z))) * (0.3193815 + (1/(1+0.2316419*ABS(z)))*(-0.3565638 + (1/(1+0.2316419*ABS(z)))*(1.781478 + (1/(1+0.2316419*ABS(z)))*(-1.821256 + (1/(1+0.2316419*ABS(z)))*1.330274))))
  )
);
CREATE TEMP FUNCTION dnorm(z FLOAT64) AS (0.3989422804 * EXP(-z * z / 2));

-- Datas, controle e split informados pelo roadmap (o sistema injeta aqui). Linha vazia só para tipar.
CREATE TEMP TABLE cfg_overrides AS
SELECT * FROM UNNEST([
  STRUCT('' AS campanha, CAST(NULL AS DATE) AS data_inicio, CAST(NULL AS DATE) AS data_fim, CAST(NULL AS STRING) AS controle)
    -- {overrides}
    , STRUCT('FIDE | Android | Modal Upsize Embalagem', DATE '2026-09-22', DATE '2026-10-08', CAST(NULL AS STRING))
    , STRUCT('FIDE | iOS | Modal Upsize Embalagem', DATE '2026-09-22', DATE '2026-10-08', CAST(NULL AS STRING))
    , STRUCT('[Ecom Fidelidade] TKM - Upsize de embalagem PDP - WEB', CAST(NULL AS DATE), CAST(NULL AS DATE), 'do_nothing_action')
    , STRUCT('[Ecom Aquisição] Novo layout cards do catálogo', DATE '2026-09-15', DATE '2026-09-23', 'do_nothing_action')
    , STRUCT('[Ecom Aquisição] Novo layout modal do catálogo - WEB', DATE '2026-09-21', DATE '2026-10-08', 'do_nothing_action')
    , STRUCT('[FIDE] Modal de variantes - Novo layout do card catálogo - APP', DATE '2026-09-23', DATE '2026-10-08', 'Controle')
    , STRUCT('[Ecom Fidelidade] Incluir counter na vitrine da Pagina Intermediária - App', DATE '2026-10-05', CAST(NULL AS DATE), 'Controle - botão "Adicionar"')
    , STRUCT('[Ecom Fidelidade] Novo layout das vitrines da busca - APP', DATE '2026-10-05', CAST(NULL AS DATE), 'Controle - card atual')
]) WHERE campanha <> '';

-- Campanhas atreladas a teste do roadmap: seguem lidas depois de sair do ar, enquanto o
-- histórico inteiro delas couber na janela (o primeiro dia depois do início da janela).
CREATE TEMP TABLE cfg_atreladas AS
SELECT campanha FROM UNNEST([
  ''
    -- {linked}
    , 'AQSI | Clube Anual Grátis - Repet e AQSI | Clube Anual Grátis - Saúde'
    , 'FIDE | Android | Modal Upsize Embalagem'
    , 'FIDE | iOS | Modal Upsize Embalagem'
    , '[Ecom Aquisição] Novo layout cards do catálogo'
    , '[Ecom Aquisição] Novo layout modal do catálogo - WEB'
    , '[Ecom Fidelidade] Incluir counter na vitrine da Pagina Intermediária - App'
    , '[Ecom Fidelidade] Novo layout das vitrines da busca - APP'
    , '[Ecom Fidelidade] TKM - Upsize de embalagem PDP - WEB'
    , '[FIDE] Modal de variantes - Novo layout do card catálogo - APP'
]) AS campanha WHERE campanha <> '';

-- Split planejado do cadastro (share por variante). Campanha sem linha aqui = split igual.
CREATE TEMP TABLE cfg_split AS
SELECT * FROM UNNEST([
  STRUCT('' AS campanha, '' AS variacao, CAST(NULL AS FLOAT64) AS share)
    -- {split}
]) WHERE campanha <> '';

-- Métrica norte de cada teste, do cadastro do roadmap. Campanha sem linha aqui: receita_por_unidade.
CREATE TEMP TABLE cfg_norte AS
SELECT * FROM UNNEST([
  STRUCT('' AS campanha, '' AS metrica)
    -- {norte}
    , STRUCT('FIDE | Android | Modal Upsize Embalagem', 'ticket')
    , STRUCT('FIDE | iOS | Modal Upsize Embalagem', 'ticket')
    , STRUCT('[Ecom Aquisição] Novo layout cards do catálogo', 'ticket')
    , STRUCT('[Ecom Aquisição] Novo layout modal do catálogo - WEB', 'ticket')
    , STRUCT('[Ecom Fidelidade] Incluir counter na vitrine da Pagina Intermediária - App', 'ticket')
    , STRUCT('[Ecom Fidelidade] Novo layout das vitrines da busca - APP', 'ticket')
    , STRUCT('[Ecom Fidelidade] TKM - Upsize de embalagem PDP - WEB', 'ticket')
    , STRUCT('[FIDE] Modal de variantes - Novo layout do card catálogo - APP', 'ticket')
]) WHERE campanha <> '';

-- Exposições: dia x usuário x sessão x campanha x variante (mesmo formato da tabela incremental exp_dia)
CREATE TEMP TABLE exp_dia AS
WITH imp AS (
  -- Exposicoes do DY ja extraidas do GA4 (dw_corporativo.ft_teste_ab, uma linha por impressao,
  -- os mesmos usuarios do ssot_ga4 conferidos em 11/10/2026) e muito mais baratas de ler. O
  -- horario vem truncado no segundo; web/app e device saem da dim_plataforma_marketing.
  SELECT
    IF(COALESCE(d.plataforma, IF(f.nm_host IS NULL, 'APP', 'WEB')) = 'WEB', 'web', 'app') AS stream,
    f.nm_host AS host, f.cod_usuario_ga AS user_pseudo_id, f.cod_sessao_ga AS ga_session_id, f.data_processamento AS refdate,
    UNIX_MICROS(f.dt_timestamp_evento) AS ts,
    IF(COALESCE(d.plataforma, IF(f.nm_host IS NULL, 'APP', 'WEB')) = 'WEB', IF(d.categoria_dispositivo = 'mobile', 'Mobile', 'Desktop'), IF(d.plataforma = 'IOS', 'iOS', 'Android')) AS device,
    f.nm_campanha AS campanha, f.nm_variante AS variacao
  FROM `petlove-dataeng-prod-01.dw_corporativo.ft_teste_ab` f
  LEFT JOIN `petlove-dataeng-prod-01.dw_corporativo.dim_plataforma_marketing` d USING (chv_plataforma_marketing)
  WHERE f.data_processamento BETWEEN d_ini AND d_fim
    AND f.cod_usuario_ga IS NOT NULL -- ~30% das impressões vêm sem usuário (consentimento negado)
),
classificada AS (
  SELECT *,
    CASE -- >>> AJUSTE: regra de BU (igual à consulta 1)
      WHEN campanha IN ('Nexus | Nova Home do App', 'Teste Banner Home') THEN 'cross'
      WHEN stream = 'app' AND REGEXP_CONTAINS(campanha, r'SAUEXP|Saude|Saúde') THEN 'saude'
      WHEN stream = 'app' THEN 'ecom'
      WHEN host IN ('saude.petlove.com.br', 'plano-de-saude.petlove.com.br') THEN 'saude'
      WHEN host = 'servicos.petlove.com.br' THEN 'servico'
      WHEN host IN ('www.petlove.com.br', 'no-cache.petlove.com.br', 'minhaconta.petlove.com.br') THEN 'ecom'
    END AS bu
  FROM imp
  WHERE campanha IS NOT NULL AND variacao IS NOT NULL
    AND (host IS NULL OR (host NOT LIKE '%staging%' AND host NOT LIKE '%-dev-%' AND host NOT LIKE 'local.%'))
    AND campanha NOT IN ('HOME ALL - CARROSSEL', 'Teste Modal de Bundle',
                         '[Clube] - area de gestão', '[Clube] Campanha na tela de sucesso da LP')
    AND (campanha_alvo IS NULL OR campanha = campanha_alvo)
)
SELECT refdate, stream, ANY_VALUE(host) AS host, ANY_VALUE(bu) AS bu, campanha, variacao,
  ARRAY_AGG(device ORDER BY ts LIMIT 1)[OFFSET(0)] AS device,
  user_pseudo_id, ga_session_id, MIN(ts) AS first_ts, COUNT(*) AS impressoes
FROM classificada WHERE bu IS NOT NULL
GROUP BY refdate, stream, campanha, variacao, user_pseudo_id, ga_session_id;

-- Testes no escopo (mesma regra da v2)
CREATE TEMP TABLE escopo AS
SELECT stream, campanha, ANY_VALUE(bu) AS bu
FROM exp_dia
GROUP BY 1, 2
HAVING COUNT(DISTINCT variacao) BETWEEN 2 AND 6
   AND (MAX(refdate) >= d_7 OR (campanha IN (SELECT campanha FROM cfg_atreladas) AND MIN(refdate) > d_ini));

-- Janela de leitura: split estável (mesma regra da v2) ou datas do roadmap
CREATE TEMP TABLE janela AS
WITH dia_var AS (SELECT e.stream, e.campanha, e.refdate, e.variacao, COUNT(DISTINCT e.user_pseudo_id) AS n FROM exp_dia e JOIN escopo USING (stream, campanha) GROUP BY 1, 2, 3, 4),
dia AS (SELECT stream, campanha, refdate, SUM(n) AS n_dia, COUNT(*) AS n_var_dia FROM dia_var GROUP BY 1, 2, 3),
-- Janela pelo split igual (1/n por variante): é como o DY desenha o teste, e o dia que foge dele
-- é rampa ou pós-rollout. A média do período inteiro, usada antes, trazia o pós-rollout para o alvo
-- e reprovava justamente os dias do teste. Campanha sem 3 dias de split igual foi desenhada desigual
-- (90/10): o alvo dela é a mediana do share diário de cada variante.
nvar AS (SELECT stream, campanha, COUNT(DISTINCT variacao) AS n_variantes FROM dia_var GROUP BY 1, 2),
share_dia AS (SELECT dv.stream, dv.campanha, dv.refdate, dv.variacao, SAFE_DIVIDE(dv.n, d.n_dia) AS share, d.n_dia, d.n_var_dia FROM dia_var dv JOIN dia d USING (stream, campanha, refdate)),
mediana_share AS (SELECT stream, campanha, variacao, APPROX_QUANTILES(share, 2)[OFFSET(1)] AS share_mediana FROM share_dia GROUP BY 1, 2, 3),
split_dia AS (
  SELECT s.stream, s.campanha, s.refdate, ANY_VALUE(s.n_dia) AS n_dia,
    ANY_VALUE(s.n_var_dia) = ANY_VALUE(v.n_variantes)
      AND LOGICAL_AND(ABS(s.share - 1 / v.n_variantes) <= GREATEST(0.03, 0.25 / v.n_variantes)) AS ok_igual,
    ANY_VALUE(s.n_var_dia) = ANY_VALUE(v.n_variantes)
      AND LOGICAL_AND(ABS(s.share - m.share_mediana) <= GREATEST(0.03, 0.25 * m.share_mediana)) AS ok_mediana
  FROM share_dia s JOIN nvar v USING (stream, campanha) JOIN mediana_share m USING (stream, campanha, variacao)
  GROUP BY 1, 2, 3
),
alvo AS (SELECT stream, campanha, COUNTIF(ok_igual) >= 3 AS usa_igual FROM split_dia GROUP BY 1, 2),
split_ok AS (SELECT sd.stream, sd.campanha, sd.refdate, sd.n_dia, IF(a.usa_igual, sd.ok_igual, sd.ok_mediana) AS ok_split FROM split_dia sd JOIN alvo a USING (stream, campanha)),
-- O volume do dia se compara com a mediana dos dias de split certo: a do período inteiro trazia o
-- pós-rollout, com todo o tráfego numa variante, e reprovava os dias do teste.
mediana AS (SELECT stream, campanha, APPROX_QUANTILES(IF(ok_split, n_dia, NULL), 2)[SAFE_OFFSET(1)] AS mediana_dia FROM split_ok GROUP BY 1, 2),
estavel AS (SELECT s.stream, s.campanha, s.refdate, s.ok_split AND s.n_dia >= 0.3 * m.mediana_dia AS ok FROM split_ok s JOIN mediana m USING (stream, campanha)),
periodo AS (
  -- detecção só vale com pelo menos 3 dias estáveis; senão usa o período inteiro
  SELECT stream, campanha,
    IF(COUNTIF(ok) >= 3, MIN(IF(ok, refdate, NULL)), NULL) AS primeiro_estavel,
    IF(COUNTIF(ok) >= 3, MAX(IF(ok, refdate, NULL)), NULL) AS ultimo_estavel,
    MIN(refdate) AS primeiro_dia, MAX(refdate) AS ultimo_dia
  FROM estavel GROUP BY 1, 2
)
SELECT p.stream, p.campanha,
  LEAST(COALESCE(o.data_inicio, DATE_ADD(p.primeiro_estavel, INTERVAL 1 DAY), p.primeiro_dia),
        LEAST(COALESCE(o.data_fim, p.ultimo_estavel, p.ultimo_dia), d_fim)) AS data_inicio_leitura,
  LEAST(COALESCE(o.data_fim, p.ultimo_estavel, p.ultimo_dia), d_fim) AS data_fim_leitura,
  CASE WHEN o.data_inicio IS NOT NULL OR o.data_fim IS NOT NULL THEN 'roadmap'
       WHEN p.primeiro_estavel IS NOT NULL THEN 'detectado' ELSE 'sem periodo estavel (periodo inteiro)' END AS origem_datas,
  p.primeiro_estavel
FROM periodo p LEFT JOIN cfg_overrides o USING (campanha);

-- Grão usuário. v3: variante = primeira por horário; "2 variantes" só conta até o fim da leitura
CREATE TEMP TABLE exp_user AS
SELECT e.stream, e.campanha, s.bu, e.user_pseudo_id,
  ARRAY_AGG(e.variacao ORDER BY e.first_ts LIMIT 1)[OFFSET(0)] AS variacao,
  COUNT(DISTINCT IF(e.refdate <= j.data_fim_leitura, e.variacao, NULL)) AS n_var,
  MIN(e.first_ts) AS first_ts, MIN(e.refdate) AS first_day,
  ARRAY_AGG(e.device ORDER BY e.first_ts LIMIT 1)[OFFSET(0)] AS device
FROM exp_dia e JOIN escopo s USING (stream, campanha) JOIN janela j USING (stream, campanha)
GROUP BY 1, 2, 3, 4;

-- Compras do GA4 (BU pelo param business_unit) + enriquecimento: clube, saúde, faturado, churn
CREATE TEMP TABLE tx AS
WITH compras AS (
  SELECT MIN(e.refdate) AS dia, e.ecommerce_transaction_id AS tid, e.user_pseudo_id, ANY_VALUE(e.ga_session_id) AS ga_session_id,
    MIN(CAST(e.event_timestamp AS INT64)) AS ts,
    MAX(IF(IS_NAN(SAFE_CAST(e.ecommerce_purchase_revenue AS FLOAT64)), NULL, SAFE_CAST(e.ecommerce_purchase_revenue AS FLOAT64))) AS receita,
    CASE MAX(IF(p.key = 'business_unit', p.string_value, NULL))
      WHEN 'e-commerce' THEN 'ecom' WHEN 'petlove' THEN 'ecom' WHEN 'landing-page' THEN 'ecom'
      WHEN 'saude' THEN 'saude' WHEN 'saude-contratacao' THEN 'saude'
      WHEN 'servico' THEN 'servico' ELSE 'outra' END AS bu
  FROM `petlove-dataeng-prod-01.ssot_ga4.events` e
  LEFT JOIN `petlove-dataeng-prod-01.ssot_ga4.event_params` p
    ON p.join_key = e.join_key AND p.refdate BETWEEN DATE_SUB(d_ini, INTERVAL cuped_dias DAY) AND d_fim AND p.key = 'business_unit'
  WHERE e.refdate BETWEEN DATE_SUB(d_ini, INTERVAL cuped_dias DAY) AND d_fim
    AND e.event_name = 'purchase' AND e.ecommerce_transaction_id IS NOT NULL
    AND (e.device_web_info_hostname IS NULL OR (e.device_web_info_hostname NOT LIKE '%staging%'
      AND e.device_web_info_hostname NOT LIKE '%-dev-%' AND e.device_web_info_hostname NOT LIKE 'local.%'))
    AND e.user_pseudo_id IN (SELECT user_pseudo_id FROM exp_user)
  GROUP BY e.ecommerce_transaction_id, e.user_pseudo_id
),
ftm AS (
  SELECT cod_transacao, ANY_VALUE(nm_unidade_negocio) AS un, LOGICAL_OR(fl_transacao_clube) AS clube,
    ANY_VALUE(vlr_receita_clube_captado) AS rev_clube, ANY_VALUE(vlr_receita_saude_captado) AS rev_saude,
    ANY_VALUE(num_pets_saude) AS pets
  FROM `petlove-dataeng-prod-01.dw_corporativo.ft_transacoes_marketing`
  WHERE data_processamento BETWEEN DATE_SUB(d_ini, INTERVAL 1 DAY) AND DATE_ADD(d_fim, INTERVAL 1 DAY)
  GROUP BY 1
),
fat AS (
  SELECT cod_transacao, SUM(vlr_receita_bruta_ecom) AS rb, SUM(vlr_margem_2) AS m2,
    LOGICAL_OR(fl_primeira_transacao_repet) AS repet_nova, MAX(NULLIF(id_membro_clube, 0)) AS membro
  FROM `petlove-dataeng-prod-01.op_digital_analytics.dts_transacoes_faturado`
  WHERE chv_data_captado BETWEEN DATE_SUB(d_ini, INTERVAL 1 DAY) AND DATE_ADD(d_fim, INTERVAL 1 DAY)
  GROUP BY 1
),
ben AS (
  SELECT CAST(vindi_subscription_id AS STRING) AS cod_transacao, COUNT(DISTINCT id_pet) AS pets_contr,
    COUNT(DISTINCT IF(dt_desligamento IS NOT NULL AND dt_desligamento >= dt_inclusao_pet, id_pet, NULL)) AS pets_desl
  FROM `petlove-dataeng-prod-01.op_health.beneficiarios`
  WHERE dt_inclusao_pet >= DATE_SUB(d_ini, INTERVAL 1 DAY) AND vindi_subscription_id IS NOT NULL
  GROUP BY 1
),
canc AS (
  SELECT chv_membro_clube_descontos AS membro, MIN(dt_cancelamento) AS dt_canc
  FROM `petlove-dataeng-prod-01.dw_corporativo.ft_cancelamentos_clube_descontos`
  WHERE dt_cancelamento >= DATE_SUB(d_ini, INTERVAL 1 DAY)
  GROUP BY 1
)
SELECT c.dia, c.tid, c.user_pseudo_id, c.ga_session_id, c.ts, c.receita, c.bu,
  f.un, COALESCE(f.clube, FALSE) AS clube, f.rev_clube, f.rev_saude, f.pets,
  t.rb, t.m2, COALESCE(t.repet_nova, FALSE) AS repet_nova,
  b.pets_contr, b.pets_desl,
  COALESCE(f.clube AND k.dt_canc >= c.dia, FALSE) AS clube_cancelado
FROM compras c
LEFT JOIN ftm f ON f.cod_transacao = c.tid
LEFT JOIN fat t ON t.cod_transacao = c.tid
LEFT JOIN ben b ON b.cod_transacao = c.tid
LEFT JOIN canc k ON k.membro = t.membro;

-- Funil: add_to_cart dos usuários expostos (indicador antecipado, vindo do dash do Pelican)
CREATE TEMP TABLE carrinho AS
SELECT e.user_pseudo_id, e.ga_session_id, e.refdate AS dia, MAX(CAST(e.event_timestamp AS INT64)) AS max_ts
FROM `petlove-dataeng-prod-01.ssot_ga4.events` e
WHERE e.refdate BETWEEN d_ini AND d_fim AND e.event_name = 'add_to_cart'
  AND e.user_pseudo_id IN (SELECT user_pseudo_id FROM exp_user)
GROUP BY 1, 2, 3;

-- Componentes por unidade (usuário e sessão): pós-exposição até o fim da leitura, e pré-período para o CUPED
CREATE TEMP TABLE unid AS
WITH exp_sess AS (
  SELECT e.stream, e.campanha, s.bu, e.user_pseudo_id, e.ga_session_id,
    ARRAY_AGG(e.variacao ORDER BY e.first_ts LIMIT 1)[OFFSET(0)] AS variacao,
    COUNT(DISTINCT e.variacao) AS n_var, MIN(e.first_ts) AS first_ts, MIN(e.refdate) AS first_day,
    ARRAY_AGG(e.device ORDER BY e.first_ts LIMIT 1)[OFFSET(0)] AS device
  FROM exp_dia e JOIN escopo s USING (stream, campanha)
  GROUP BY 1, 2, 3, 4, 5
),
base_u AS (
  SELECT 'usuario' AS grao, u.stream, u.campanha, u.bu, u.variacao, u.device, u.user_pseudo_id AS unidade,
    u.user_pseudo_id, CAST(NULL AS STRING) AS ga_session_id, u.first_ts, j.data_fim_leitura AS fim
  FROM exp_user u JOIN janela j USING (stream, campanha)
  WHERE u.n_var = 1 AND u.first_day BETWEEN j.data_inicio_leitura AND j.data_fim_leitura
  UNION ALL
  SELECT 'sessao', u.stream, u.campanha, u.bu, u.variacao, u.device, CONCAT(u.user_pseudo_id, '|', u.ga_session_id),
    u.user_pseudo_id, u.ga_session_id, u.first_ts, j.data_fim_leitura
  FROM exp_sess u JOIN janela j USING (stream, campanha)
  WHERE u.n_var = 1 AND u.first_day BETWEEN j.data_inicio_leitura AND j.data_fim_leitura
),
comp AS (
  SELECT b.grao, b.stream, b.campanha, b.unidade, p.*,
    p.ts >= b.first_ts AS pos, (b.bu = 'cross' OR p.bu = b.bu) AS bu_ok
  FROM base_u b
  JOIN tx p ON p.user_pseudo_id = b.user_pseudo_id
    AND p.ts >= b.first_ts - cuped_dias * 86400000000 AND p.dia <= b.fim
    -- sessão: depois da exposição só conta a compra da própria sessão; antes, qualquer compra do usuário
    AND (b.ga_session_id IS NULL OR p.ts < b.first_ts OR p.ga_session_id = b.ga_session_id)
),
somas AS (
  SELECT grao, stream, campanha, unidade,
    COUNTIF(pos AND bu_ok) AS tx_bu,
    COALESCE(SUM(IF(pos AND bu_ok, receita, 0)), 0) AS rev_bu,
    COALESCE(SUM(IF(pos AND un = 'ecom' AND NOT clube, rb, 0)), 0) AS rb,
    COALESCE(SUM(IF(pos AND un = 'ecom', m2, 0)), 0) AS m2,
    COUNTIF(pos AND clube) AS clube_n, COALESCE(SUM(IF(pos AND clube, rev_clube, 0)), 0) AS clube_rev,
    COUNTIF(pos AND clube_cancelado) AS clube_canc,
    COUNTIF(pos AND repet_nova) AS repet_nova,
    COUNTIF(pos AND un = 'saude') AS saude_n, COALESCE(SUM(IF(pos AND un = 'saude', pets, 0)), 0) AS pets,
    COALESCE(SUM(IF(pos AND un = 'saude', pets_contr, 0)), 0) AS pets_contr,
    COALESCE(SUM(IF(pos AND un = 'saude', pets_desl, 0)), 0) AS pets_desl,
    COALESCE(SUM(IF(pos AND un = 'saude', rev_saude, 0)), 0) AS rev_saude,
    COALESCE(SUM(IF(NOT pos AND bu_ok, receita, 0)), 0) AS pre_rev,
    COUNTIF(NOT pos AND bu_ok) AS pre_tx
  FROM comp GROUP BY 1, 2, 3, 4
),
carr AS (
  SELECT b.grao, b.stream, b.campanha, b.unidade, 1 AS carrinho
  FROM base_u b JOIN carrinho c ON c.user_pseudo_id = b.user_pseudo_id AND c.dia <= b.fim AND c.max_ts >= b.first_ts
    AND (b.ga_session_id IS NULL OR c.ga_session_id = b.ga_session_id)
  GROUP BY 1, 2, 3, 4
)
SELECT b.grao, b.stream, b.campanha, b.bu, b.variacao, b.device, b.unidade,
  COALESCE(s.tx_bu, 0) AS tx_bu, COALESCE(s.rev_bu, 0) AS rev_bu, COALESCE(s.rb, 0) AS rb, COALESCE(s.m2, 0) AS m2,
  COALESCE(s.clube_n, 0) AS clube_n, COALESCE(s.clube_rev, 0) AS clube_rev, COALESCE(s.clube_canc, 0) AS clube_canc,
  COALESCE(s.repet_nova, 0) AS repet_nova, COALESCE(s.saude_n, 0) AS saude_n, COALESCE(s.pets, 0) AS pets,
  COALESCE(s.pets_contr, 0) AS pets_contr, COALESCE(s.pets_desl, 0) AS pets_desl, COALESCE(s.rev_saude, 0) AS rev_saude,
  COALESCE(s.pre_rev, 0) AS pre_rev, COALESCE(s.pre_tx, 0) AS pre_tx, COALESCE(c.carrinho, 0) AS carrinho
FROM base_u b
LEFT JOIN somas s USING (grao, stream, campanha, unidade)
LEFT JOIN carr c USING (grao, stream, campanha, unidade);

-- Uma linha por unidade x métrica; teto de outlier; CUPED (theta = cov(x, pré) / var(pré), por campanha x grão x métrica)
CREATE TEMP TABLE agg AS
WITH longo AS (
  SELECT u.grao, u.stream, u.campanha, u.bu, dev AS device, u.variacao, m.*
  FROM unid u
  CROSS JOIN UNNEST([u.device, 'Total']) AS dev
  CROSS JOIN UNNEST([
    STRUCT('conversao' AS metrica, 'maior' AS sentido, 'prop' AS tipo, FALSE AS monetaria, CAST(IF(u.tx_bu > 0, 1.0, 0.0) AS FLOAT64) AS x, CAST(1.0 AS FLOAT64) AS y, CAST(NULL AS FLOAT64) AS pre),
    ('receita_por_unidade', 'maior', 'media', TRUE, CAST(u.rev_bu AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(u.pre_rev AS FLOAT64)),
    ('transacoes_por_unidade', 'maior', 'media', FALSE, CAST(u.tx_bu AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(u.pre_tx AS FLOAT64)),
    ('ticket', 'maior', 'razao', TRUE, CAST(u.rev_bu AS FLOAT64), CAST(u.tx_bu AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('receita_bruta_faturada_por_unidade', 'maior', 'media', TRUE, CAST(u.rb AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(u.pre_rev AS FLOAT64)),
    ('margem2_por_unidade', 'maior', 'media', TRUE, CAST(u.m2 AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(u.pre_rev AS FLOAT64)),
    ('conversao_clube', 'maior', 'prop', FALSE, CAST(IF(u.clube_n > 0, 1.0, 0.0) AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('receita_clube_por_unidade', 'maior', 'media', TRUE, CAST(u.clube_rev AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('churn_clube', 'menor', 'prop', FALSE, CAST(u.clube_canc AS FLOAT64), CAST(u.clube_n AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('conversao_repet_nova', 'maior', 'prop', FALSE, CAST(IF(u.repet_nova > 0, 1.0, 0.0) AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('conversao_saude', 'maior', 'prop', FALSE, CAST(IF(u.saude_n > 0, 1.0, 0.0) AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('vidas_por_unidade', 'maior', 'media', FALSE, CAST(u.pets AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('receita_saude_por_unidade', 'maior', 'media', TRUE, CAST(u.rev_saude AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('ticket_saude', 'maior', 'razao', TRUE, CAST(u.rev_saude AS FLOAT64), CAST(u.saude_n AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('churn_saude', 'menor', 'prop', FALSE, CAST(u.pets_desl AS FLOAT64), CAST(u.pets_contr AS FLOAT64), CAST(NULL AS FLOAT64)),
    ('conversao_carrinho', 'maior', 'prop', FALSE, CAST(CAST(u.carrinho AS FLOAT64) AS FLOAT64), CAST(1.0 AS FLOAT64), CAST(NULL AS FLOAT64))
  ]) AS m
),
caps AS (
  SELECT grao, stream, campanha, metrica,
    APPROX_QUANTILES(x, 1000)[OFFSET(1)] AS lo, APPROX_QUANTILES(x, 1000)[OFFSET(999)] AS hi
  FROM longo WHERE monetaria AND x != 0 AND device = 'Total'
  GROUP BY 1, 2, 3, 4
),
cap AS (
  SELECT l.*, IF(l.monetaria AND l.x != 0, LEAST(GREATEST(l.x, c.lo), c.hi), l.x) AS xc
  FROM longo l LEFT JOIN caps c USING (grao, stream, campanha, metrica)
),
theta AS (
  SELECT grao, stream, campanha, metrica, SAFE_DIVIDE(COVAR_POP(xc, pre), VAR_POP(pre)) AS th, AVG(pre) AS mpre
  FROM cap WHERE pre IS NOT NULL AND device = 'Total'
  GROUP BY 1, 2, 3, 4
)
SELECT l.grao, l.stream, l.campanha, l.bu, l.device, l.variacao, l.metrica, ANY_VALUE(l.sentido) AS sentido,
  ANY_VALUE(l.tipo) AS tipo, LOGICAL_OR(t.th IS NOT NULL) AS cuped,
  COUNT(*) AS n, SUM(l.x) AS sx_bruto, SUM(l.xc) AS sx, SUM(l.y) AS sy,
  SUM(l.xc * l.xc) AS sxx, SUM(l.y * l.y) AS syy, SUM(l.xc * l.y) AS sxy, COUNTIF(l.x != 0) AS nz,
  SUM(l.xc - COALESCE(t.th, 0) * (COALESCE(l.pre, 0) - COALESCE(t.mpre, 0))) AS sa,
  SUM(POW(l.xc - COALESCE(t.th, 0) * (COALESCE(l.pre, 0) - COALESCE(t.mpre, 0)), 2)) AS saa
FROM cap l LEFT JOIN theta t USING (grao, stream, campanha, metrica)
GROUP BY 1, 2, 3, 4, 5, 6, 7;

-- Resultado
WITH est AS (
  -- estimativa e variância da média de cada braço, por tipo de métrica
  SELECT *, SAFE_DIVIDE(sx, sy) AS valor,
    CASE tipo
      WHEN 'prop' THEN IF(sy > 0, (sx + 1) / (sy + 2), NULL)                              -- Agresti-Caffo / Beta(1,1)
      WHEN 'media' THEN sa / n                                                             -- média com CUPED
      ELSE SAFE_DIVIDE(sx, sy) END AS ev,
    CASE tipo
      WHEN 'prop' THEN IF(sy > 0, ((sx + 1) / (sy + 2)) * (1 - (sx + 1) / (sy + 2)) / (sy + 2), NULL)
      WHEN 'media' THEN GREATEST(0, (saa / n - POW(sa / n, 2)) / n)
      ELSE GREATEST(0, SAFE_DIVIDE(                                                        -- delta method da razão
        (sxx / n - POW(sx / n, 2)) - 2 * SAFE_DIVIDE(sx, sy) * (sxy / n - (sx / n) * (sy / n))
        + POW(SAFE_DIVIDE(sx, sy), 2) * (syy / n - POW(sy / n, 2)), n * POW(sy / n, 2))) END AS v,
    CASE tipo WHEN 'prop' THEN sx WHEN 'media' THEN nz ELSE sy END AS eventos
  FROM agg
),
base_unid AS (SELECT grao, stream, campanha, device, variacao, n AS unidades, sx AS transacoes FROM agg WHERE metrica = 'transacoes_por_unidade'),
com_controle AS (
  SELECT u.*,
    CASE
      WHEN u.variacao = o.controle THEN 2 -- controle fixado no roadmap
      WHEN COALESCE(
        CASE WHEN u.campanha = '[Experiência][A/B] Teste A/B/C Busca sem cache' THEN u.variacao = '0' END, -- >>> AJUSTE: controle fixo por campanha
        REGEXP_CONTAINS(u.variacao, r'(?i)do_nothing|control|controle|antig|desativado|sem modal|sem recomenda|formato antigo')
      ) THEN 1
      ELSE 0 END AS prioridade_controle
  FROM base_unid u LEFT JOIN cfg_overrides o ON o.campanha = u.campanha
),
controle AS (
  SELECT grao, stream, campanha, device, variacao AS variacao_controle,
    CASE prioridade_controle WHEN 2 THEN 'roadmap' WHEN 1 THEN 'nome' ELSE 'alfabetica' END AS origem_controle
  FROM (SELECT *, ROW_NUMBER() OVER (PARTITION BY grao, stream, campanha, device ORDER BY prioridade_controle DESC, variacao) AS rn FROM com_controle)
  WHERE rn = 1
),
totais AS (
  SELECT grao, stream, campanha, device, SUM(unidades) AS unidades_teste, COUNT(*) AS n_variantes,
    MIN(unidades) AS min_unidades, MIN(transacoes) AS min_transacoes
  FROM base_unid GROUP BY 1, 2, 3, 4
),
-- qui-quadrado do split contra o planejado; p pela aproximação de Wilson-Hilferty
srm AS (
  SELECT u.grao, u.stream, u.campanha, u.device,
    SUM(POW(u.unidades - t.unidades_teste * COALESCE(sp.share, 1 / t.n_variantes), 2)
        / (t.unidades_teste * COALESCE(sp.share, 1 / t.n_variantes))) AS chi2,
    ANY_VALUE(t.n_variantes) - 1 AS gl
  FROM base_unid u JOIN totais t USING (grao, stream, campanha, device)
  LEFT JOIN cfg_split sp ON sp.campanha = u.campanha AND sp.variacao = u.variacao
  GROUP BY 1, 2, 3, 4
),
srm_p AS (
  SELECT *, 1 - phi((POW(chi2 / gl, 1 / 3) - (1 - 2 / (9 * gl))) / SQRT(2 / (9 * gl))) AS p_srm
  FROM srm WHERE gl > 0
),
dupes AS (
  SELECT u.stream, u.campanha, COUNTIF(u.n_var > 1) AS usuarios_2_variantes
  FROM exp_user u JOIN janela j USING (stream, campanha)
  WHERE u.first_day BETWEEN j.data_inicio_leitura AND j.data_fim_leitura
  GROUP BY 1, 2
),
final AS (
  SELECT v.*, c.variacao_controle, c.origem_controle, k.ev AS c_ev, k.v AS c_v, k.eventos AS c_eventos,
    t.unidades_teste, t.n_variantes, t.min_unidades, t.min_transacoes, s.p_srm,
    -- Dunnett (todas as variantes contra o controle), bicaudal 95%
    CASE t.n_variantes WHEN 2 THEN 1.96 WHEN 3 THEN 2.212 WHEN 4 THEN 2.349 WHEN 5 THEN 2.442 ELSE 2.519 END AS z_crit,
    IF(v.sentido = 'menor', -1, 1) AS sg,
    v.ev > 0 AND k.ev > 0 AS logr,
    COALESCE(cn.metrica, 'receita_por_unidade') AS norte,
    DATE_DIFF(j.data_fim_leitura, j.data_inicio_leitura, DAY) + 1 AS dias_leitura
  FROM est v
  JOIN controle c USING (grao, stream, campanha, device)
  JOIN est k ON k.grao = v.grao AND k.stream = v.stream AND k.campanha = v.campanha AND k.device = v.device
            AND k.metrica = v.metrica AND k.variacao = c.variacao_controle
  JOIN totais t ON t.grao = v.grao AND t.stream = v.stream AND t.campanha = v.campanha AND t.device = v.device
  JOIN janela j ON j.stream = v.stream AND j.campanha = v.campanha
  LEFT JOIN srm_p s ON s.grao = v.grao AND s.stream = v.stream AND s.campanha = v.campanha AND s.device = v.device
  LEFT JOIN cfg_norte cn ON cn.campanha = v.campanha
),
-- efeito em log-razão (fallback linear quando algum braço tem estimativa <= 0, ex.: margem negativa)
efeito AS (
  SELECT *,
    IF(logr, LN(ev / c_ev), SAFE_DIVIDE(ev - c_ev, ABS(c_ev))) AS lr,
    IF(logr, SQRT(SAFE_DIVIDE(v, ev * ev) + SAFE_DIVIDE(c_v, c_ev * c_ev)), SAFE_DIVIDE(SQRT(v + c_v), ABS(c_ev))) AS se_lr
  FROM final
),
res AS (
  SELECT e.*,
    e.variacao = e.variacao_controle AS is_controle,
    CASE WHEN e.metrica = e.norte THEN 'norte' WHEN e.metrica IN ('conversao', 'margem2_por_unidade') THEN 'guarda' ELSE 'exploratoria' END AS papel,
    IF(e.logr, e.ev / e.c_ev - 1, e.lr) AS uplift,
    IF(e.logr, EXP(e.lr - e.z_crit * e.se_lr) - 1, e.lr - e.z_crit * e.se_lr) AS ic_lo,
    IF(e.logr, EXP(e.lr + e.z_crit * e.se_lr) - 1, e.lr + e.z_crit * e.se_lr) AS ic_hi,
    SAFE_DIVIDE(e.lr, e.se_lr) AS z,
    phi(e.sg * SAFE_DIVIDE(e.lr, e.se_lr)) AS p_vence,                     -- prior plano (igual à v2)
    2 * (1 - phi(ABS(SAFE_DIVIDE(e.lr, e.se_lr)))) AS p2,                  -- p-valor bicaudal
    phi(e.sg * SAFE_DIVIDE(e.lr, e.se_lr)) AS p_dano,                      -- p-valor unicaudal de piora
    (e.z_crit + 0.84) * e.se_lr AS mde,
    LEAST(e.eventos, e.c_eventos) AS eventos_min,
    -- posterior com prior Normal(0; prior_dp) no log da razão
    SAFE_DIVIDE(1, SAFE_DIVIDE(1, e.se_lr * e.se_lr) + 1 / (prior_dp * prior_dp)) AS pv,
    CASE
      WHEN e.min_unidades / e.unidades_teste < 0.05 THEN 'decidido'
      WHEN e.min_transacoes < 50 THEN 'volume baixo'
      WHEN e.p_srm < 0.001 THEN 'split desigual'
      ELSE 'saudavel' END AS status_linha
  FROM efeito e
),
bayes AS (
  SELECT r.*, r.pv * SAFE_DIVIDE(r.lr, r.se_lr * r.se_lr) AS pm, SQRT(r.pv) AS psd FROM res r
),
bayes2 AS (
  SELECT b.*,
    IF(b.logr, EXP(b.pm) - 1, b.pm) AS uplift_esperado,
    phi(SAFE_DIVIDE(b.sg * b.pm, b.psd)) AS chance_melhor,
    b.psd * dnorm(SAFE_DIVIDE(b.sg * b.pm, b.psd)) - b.sg * b.pm * phi(-SAFE_DIVIDE(b.sg * b.pm, b.psd)) AS perda_ligar,
    b.psd * dnorm(SAFE_DIVIDE(b.sg * b.pm, b.psd)) + b.sg * b.pm * phi(SAFE_DIVIDE(b.sg * b.pm, b.psd)) AS perda_manter
  FROM bayes b
),
-- multiplicidade entre métricas, por variante: Holm nas guardas (piora e diferença) e Benjamini-Hochberg nas exploratórias
mult AS (
  SELECT grao, stream, campanha, device, variacao, metrica, papel, p_dano, p2,
    ROW_NUMBER() OVER w_d AS rk_d, ROW_NUMBER() OVER w_p AS rk_p, COUNT(*) OVER w AS m_papel
  FROM bayes2
  WHERE NOT is_controle AND p2 IS NOT NULL AND eventos_min >= min_eventos AND papel != 'norte'
  WINDOW w AS (PARTITION BY grao, stream, campanha, device, variacao, papel),
         w_d AS (PARTITION BY grao, stream, campanha, device, variacao, papel ORDER BY p_dano),
         w_p AS (PARTITION BY grao, stream, campanha, device, variacao, papel ORDER BY p2)
),
mult2 AS (
  SELECT *, p_dano <= alfa / (m_papel - rk_d + 1) AS ok_d, p2 <= alfa / (m_papel - rk_p + 1) AS ok_h,
    p2 <= fdr_q * rk_p / m_papel AS ok_bh
  FROM mult
),
mult3 AS (
  SELECT grao, stream, campanha, device, variacao, metrica,
    rk_d < MIN(IF(NOT ok_d, rk_d, 999)) OVER w AS dano_holm,
    rk_p < MIN(IF(NOT ok_h, rk_p, 999)) OVER w AS holm,
    rk_p <= MAX(IF(ok_bh, rk_p, 0)) OVER w AS bh
  FROM mult2
  WINDOW w AS (PARTITION BY grao, stream, campanha, device, variacao, papel)
),
marc AS (
  SELECT b.*,
    NOT b.is_controle AND b.eventos_min >= min_eventos AND CASE b.papel
      WHEN 'norte' THEN ABS(b.z) >= b.z_crit
      WHEN 'guarda' THEN COALESCE(m.holm, FALSE)
      ELSE COALESCE(m.bh, FALSE) END AS confirmado,
    b.papel = 'guarda' AND COALESCE(m.dano_holm, FALSE) AS alerta_dano
  FROM bayes2 b
  LEFT JOIN mult3 m USING (grao, stream, campanha, device, variacao, metrica)
),
alertas AS (
  SELECT grao, stream, campanha, device, variacao, STRING_AGG(metrica, ', ' ORDER BY metrica) AS guardas_piora
  FROM marc WHERE alerta_dano GROUP BY 1, 2, 3, 4, 5
),
rec AS (
  SELECT m.*, a.guardas_piora,
    CASE
      WHEN m.is_controle THEN NULL
      WHEN m.status_linha != 'saudavel' THEN CONCAT('Aguardar (', m.status_linha, ')')
      WHEN m.dias_leitura < dias_minimos THEN CONCAT('Aguardar (menos de ', CAST(dias_minimos AS STRING), ' dias)')
      WHEN m.eventos_min IS NULL OR m.eventos_min < min_eventos THEN 'Aguardar (poucos eventos)'
      WHEN m.perda_ligar IS NULL THEN 'Sem dado'
      WHEN m.papel = 'norte' AND a.guardas_piora IS NOT NULL THEN CONCAT('Não ligar: piora ', a.guardas_piora)
      WHEN m.ic_lo > -rope AND m.ic_hi < rope THEN 'Sem diferença relevante'
      WHEN m.perda_ligar <= limiar_perda AND m.perda_ligar <= m.perda_manter THEN 'Ligar variante'
      WHEN m.perda_manter <= limiar_perda THEN 'Manter controle'
      ELSE 'Continuar coletando' END AS recomendacao
  FROM marc m
  LEFT JOIN alertas a USING (grao, stream, campanha, device, variacao)
)
SELECT
  d_fim AS dados_ate,
  r.grao, r.stream, r.bu, r.campanha, r.device, r.variacao,
  LOGICAL_OR(r.is_controle) AS is_controle, ANY_VALUE(r.origem_controle) AS origem_controle,
  ANY_VALUE(j.data_inicio_leitura) AS data_inicio_leitura, ANY_VALUE(j.data_fim_leitura) AS data_fim_leitura,
  ANY_VALUE(j.origem_datas) AS origem_datas, ANY_VALUE(j.primeiro_estavel) AS primeiro_dia_split_estavel,
  ANY_VALUE(r.n) AS unidades, ROUND(ANY_VALUE(r.n / r.unidades_teste), 4) AS share_unidades,
  CAST(MAX(IF(r.metrica = 'conversao', r.sx_bruto, NULL)) AS INT64) AS compradores,
  CAST(MAX(IF(r.metrica = 'transacoes_por_unidade', r.sx_bruto, NULL)) AS INT64) AS transacoes,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.sx_bruto, NULL)), 2) AS receita,
  ROUND(MAX(IF(r.metrica = 'conversao', r.valor, NULL)), 5) AS conversao,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.valor, NULL)), 4) AS receita_por_unidade,
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.valor, NULL)), 5) AS transacoes_por_unidade,
  ROUND(MAX(IF(r.metrica = 'ticket', r.valor, NULL)), 2) AS ticket,
  -- conversao: uplift vs controle (linha do controle: 0)
  ROUND(MAX(IF(r.metrica = 'conversao', r.uplift, NULL)), 4) AS uplift_conversao,
  ROUND(MAX(IF(r.metrica = 'conversao', r.ic_lo, NULL)), 4) AS ic_lo_conversao,
  ROUND(MAX(IF(r.metrica = 'conversao', r.ic_hi, NULL)), 4) AS ic_hi_conversao,
  ROUND(MAX(IF(r.metrica = 'conversao', r.p_vence, NULL)), 4) AS p_vence_conversao,
  ROUND(MAX(IF(r.metrica = 'conversao', r.mde, NULL)), 4) AS mde_conversao,
  -- receita_por_unidade: uplift vs controle (linha do controle: 0)
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.uplift, NULL)), 4) AS uplift_receita_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.ic_lo, NULL)), 4) AS ic_lo_receita_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.ic_hi, NULL)), 4) AS ic_hi_receita_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.p_vence, NULL)), 4) AS p_vence_receita_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.mde, NULL)), 4) AS mde_receita_por_unidade,
  -- transacoes_por_unidade: uplift vs controle (linha do controle: 0)
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.uplift, NULL)), 4) AS uplift_transacoes_por_unidade,
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.ic_lo, NULL)), 4) AS ic_lo_transacoes_por_unidade,
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.ic_hi, NULL)), 4) AS ic_hi_transacoes_por_unidade,
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.p_vence, NULL)), 4) AS p_vence_transacoes_por_unidade,
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.mde, NULL)), 4) AS mde_transacoes_por_unidade,
  -- ticket: uplift vs controle (linha do controle: 0)
  ROUND(MAX(IF(r.metrica = 'ticket', r.uplift, NULL)), 4) AS uplift_ticket,
  ROUND(MAX(IF(r.metrica = 'ticket', r.ic_lo, NULL)), 4) AS ic_lo_ticket,
  ROUND(MAX(IF(r.metrica = 'ticket', r.ic_hi, NULL)), 4) AS ic_hi_ticket,
  ROUND(MAX(IF(r.metrica = 'ticket', r.p_vence, NULL)), 4) AS p_vence_ticket,
  ROUND(MAX(IF(r.metrica = 'ticket', r.mde, NULL)), 4) AS mde_ticket,
  -- variância da estimativa de cada métrica: o roadmap soma campanhas (iOS + Android) estratificando
  MAX(IF(r.metrica = 'conversao', r.v, NULL)) AS var_conversao,
  MAX(IF(r.metrica = 'receita_por_unidade', r.v, NULL)) AS var_receita_por_unidade,
  MAX(IF(r.metrica = 'transacoes_por_unidade', r.v, NULL)) AS var_transacoes_por_unidade,
  MAX(IF(r.metrica = 'ticket', r.v, NULL)) AS var_ticket,
  ANY_VALUE(r.n_variantes) AS n_variantes,
  ANY_VALUE(dp.usuarios_2_variantes) AS usuarios_2_variantes,
  ANY_VALUE(r.status_linha) AS status,
  -- ===== colunas novas (v3) =====
  ROUND(ANY_VALUE(r.p_srm), 6) AS p_srm,
  ANY_VALUE(r.dias_leitura) AS dias_leitura,
  ANY_VALUE(r.norte) AS metrica_norte,
  ANY_VALUE(r.guardas_piora) AS guardas_piora,
  -- conversao: papel, multiplicidade e leitura bayesiana
  MAX(IF(r.metrica = 'conversao', r.papel, NULL)) AS papel_conversao,
  MAX(IF(r.metrica = 'conversao', r.eventos_min, NULL)) AS eventos_min_conversao,
  LOGICAL_OR(r.metrica = 'conversao' AND r.confirmado) AS confirmado_conversao,
  ROUND(MAX(IF(r.metrica = 'conversao', r.uplift_esperado, NULL)), 4) AS uplift_esperado_conversao,
  ROUND(MAX(IF(r.metrica = 'conversao', r.chance_melhor, NULL)), 4) AS chance_melhor_conversao,
  ROUND(MAX(IF(r.metrica = 'conversao', r.perda_ligar, NULL)), 5) AS perda_ligar_conversao,
  ROUND(MAX(IF(r.metrica = 'conversao', r.perda_manter, NULL)), 5) AS perda_manter_conversao,
  MAX(IF(r.metrica = 'conversao', r.recomendacao, NULL)) AS recomendacao_conversao,
  LOGICAL_OR(r.metrica = 'conversao' AND r.cuped) AS cuped_conversao,
  -- receita_por_unidade: papel, multiplicidade e leitura bayesiana
  MAX(IF(r.metrica = 'receita_por_unidade', r.papel, NULL)) AS papel_receita_por_unidade,
  MAX(IF(r.metrica = 'receita_por_unidade', r.eventos_min, NULL)) AS eventos_min_receita_por_unidade,
  LOGICAL_OR(r.metrica = 'receita_por_unidade' AND r.confirmado) AS confirmado_receita_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.uplift_esperado, NULL)), 4) AS uplift_esperado_receita_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.chance_melhor, NULL)), 4) AS chance_melhor_receita_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.perda_ligar, NULL)), 5) AS perda_ligar_receita_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_por_unidade', r.perda_manter, NULL)), 5) AS perda_manter_receita_por_unidade,
  MAX(IF(r.metrica = 'receita_por_unidade', r.recomendacao, NULL)) AS recomendacao_receita_por_unidade,
  LOGICAL_OR(r.metrica = 'receita_por_unidade' AND r.cuped) AS cuped_receita_por_unidade,
  -- transacoes_por_unidade: papel, multiplicidade e leitura bayesiana
  MAX(IF(r.metrica = 'transacoes_por_unidade', r.papel, NULL)) AS papel_transacoes_por_unidade,
  MAX(IF(r.metrica = 'transacoes_por_unidade', r.eventos_min, NULL)) AS eventos_min_transacoes_por_unidade,
  LOGICAL_OR(r.metrica = 'transacoes_por_unidade' AND r.confirmado) AS confirmado_transacoes_por_unidade,
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.uplift_esperado, NULL)), 4) AS uplift_esperado_transacoes_por_unidade,
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.chance_melhor, NULL)), 4) AS chance_melhor_transacoes_por_unidade,
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.perda_ligar, NULL)), 5) AS perda_ligar_transacoes_por_unidade,
  ROUND(MAX(IF(r.metrica = 'transacoes_por_unidade', r.perda_manter, NULL)), 5) AS perda_manter_transacoes_por_unidade,
  MAX(IF(r.metrica = 'transacoes_por_unidade', r.recomendacao, NULL)) AS recomendacao_transacoes_por_unidade,
  LOGICAL_OR(r.metrica = 'transacoes_por_unidade' AND r.cuped) AS cuped_transacoes_por_unidade,
  -- ticket: papel, multiplicidade e leitura bayesiana
  MAX(IF(r.metrica = 'ticket', r.papel, NULL)) AS papel_ticket,
  MAX(IF(r.metrica = 'ticket', r.eventos_min, NULL)) AS eventos_min_ticket,
  LOGICAL_OR(r.metrica = 'ticket' AND r.confirmado) AS confirmado_ticket,
  ROUND(MAX(IF(r.metrica = 'ticket', r.uplift_esperado, NULL)), 4) AS uplift_esperado_ticket,
  ROUND(MAX(IF(r.metrica = 'ticket', r.chance_melhor, NULL)), 4) AS chance_melhor_ticket,
  ROUND(MAX(IF(r.metrica = 'ticket', r.perda_ligar, NULL)), 5) AS perda_ligar_ticket,
  ROUND(MAX(IF(r.metrica = 'ticket', r.perda_manter, NULL)), 5) AS perda_manter_ticket,
  MAX(IF(r.metrica = 'ticket', r.recomendacao, NULL)) AS recomendacao_ticket,
  LOGICAL_OR(r.metrica = 'ticket' AND r.cuped) AS cuped_ticket,
  -- receita_bruta_faturada_por_unidade
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.valor, NULL)), 5) AS receita_bruta_faturada_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.uplift, NULL)), 4) AS uplift_receita_bruta_faturada_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.ic_lo, NULL)), 4) AS ic_lo_receita_bruta_faturada_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.ic_hi, NULL)), 4) AS ic_hi_receita_bruta_faturada_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.p_vence, NULL)), 4) AS p_vence_receita_bruta_faturada_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.mde, NULL)), 4) AS mde_receita_bruta_faturada_por_unidade,
  MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.v, NULL)) AS var_receita_bruta_faturada_por_unidade,
  MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.papel, NULL)) AS papel_receita_bruta_faturada_por_unidade,
  MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.eventos_min, NULL)) AS eventos_min_receita_bruta_faturada_por_unidade,
  LOGICAL_OR(r.metrica = 'receita_bruta_faturada_por_unidade' AND r.confirmado) AS confirmado_receita_bruta_faturada_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.uplift_esperado, NULL)), 4) AS uplift_esperado_receita_bruta_faturada_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.chance_melhor, NULL)), 4) AS chance_melhor_receita_bruta_faturada_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.perda_ligar, NULL)), 5) AS perda_ligar_receita_bruta_faturada_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.perda_manter, NULL)), 5) AS perda_manter_receita_bruta_faturada_por_unidade,
  MAX(IF(r.metrica = 'receita_bruta_faturada_por_unidade', r.recomendacao, NULL)) AS recomendacao_receita_bruta_faturada_por_unidade,
  LOGICAL_OR(r.metrica = 'receita_bruta_faturada_por_unidade' AND r.cuped) AS cuped_receita_bruta_faturada_por_unidade,
  -- margem2_por_unidade
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.valor, NULL)), 5) AS margem2_por_unidade,
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.uplift, NULL)), 4) AS uplift_margem2_por_unidade,
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.ic_lo, NULL)), 4) AS ic_lo_margem2_por_unidade,
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.ic_hi, NULL)), 4) AS ic_hi_margem2_por_unidade,
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.p_vence, NULL)), 4) AS p_vence_margem2_por_unidade,
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.mde, NULL)), 4) AS mde_margem2_por_unidade,
  MAX(IF(r.metrica = 'margem2_por_unidade', r.v, NULL)) AS var_margem2_por_unidade,
  MAX(IF(r.metrica = 'margem2_por_unidade', r.papel, NULL)) AS papel_margem2_por_unidade,
  MAX(IF(r.metrica = 'margem2_por_unidade', r.eventos_min, NULL)) AS eventos_min_margem2_por_unidade,
  LOGICAL_OR(r.metrica = 'margem2_por_unidade' AND r.confirmado) AS confirmado_margem2_por_unidade,
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.uplift_esperado, NULL)), 4) AS uplift_esperado_margem2_por_unidade,
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.chance_melhor, NULL)), 4) AS chance_melhor_margem2_por_unidade,
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.perda_ligar, NULL)), 5) AS perda_ligar_margem2_por_unidade,
  ROUND(MAX(IF(r.metrica = 'margem2_por_unidade', r.perda_manter, NULL)), 5) AS perda_manter_margem2_por_unidade,
  MAX(IF(r.metrica = 'margem2_por_unidade', r.recomendacao, NULL)) AS recomendacao_margem2_por_unidade,
  LOGICAL_OR(r.metrica = 'margem2_por_unidade' AND r.cuped) AS cuped_margem2_por_unidade,
  -- conversao_clube
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.valor, NULL)), 5) AS conversao_clube,
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.uplift, NULL)), 4) AS uplift_conversao_clube,
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.ic_lo, NULL)), 4) AS ic_lo_conversao_clube,
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.ic_hi, NULL)), 4) AS ic_hi_conversao_clube,
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.p_vence, NULL)), 4) AS p_vence_conversao_clube,
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.mde, NULL)), 4) AS mde_conversao_clube,
  MAX(IF(r.metrica = 'conversao_clube', r.v, NULL)) AS var_conversao_clube,
  MAX(IF(r.metrica = 'conversao_clube', r.papel, NULL)) AS papel_conversao_clube,
  MAX(IF(r.metrica = 'conversao_clube', r.eventos_min, NULL)) AS eventos_min_conversao_clube,
  LOGICAL_OR(r.metrica = 'conversao_clube' AND r.confirmado) AS confirmado_conversao_clube,
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.uplift_esperado, NULL)), 4) AS uplift_esperado_conversao_clube,
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.chance_melhor, NULL)), 4) AS chance_melhor_conversao_clube,
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.perda_ligar, NULL)), 5) AS perda_ligar_conversao_clube,
  ROUND(MAX(IF(r.metrica = 'conversao_clube', r.perda_manter, NULL)), 5) AS perda_manter_conversao_clube,
  MAX(IF(r.metrica = 'conversao_clube', r.recomendacao, NULL)) AS recomendacao_conversao_clube,
  LOGICAL_OR(r.metrica = 'conversao_clube' AND r.cuped) AS cuped_conversao_clube,
  -- receita_clube_por_unidade
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.valor, NULL)), 5) AS receita_clube_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.uplift, NULL)), 4) AS uplift_receita_clube_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.ic_lo, NULL)), 4) AS ic_lo_receita_clube_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.ic_hi, NULL)), 4) AS ic_hi_receita_clube_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.p_vence, NULL)), 4) AS p_vence_receita_clube_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.mde, NULL)), 4) AS mde_receita_clube_por_unidade,
  MAX(IF(r.metrica = 'receita_clube_por_unidade', r.v, NULL)) AS var_receita_clube_por_unidade,
  MAX(IF(r.metrica = 'receita_clube_por_unidade', r.papel, NULL)) AS papel_receita_clube_por_unidade,
  MAX(IF(r.metrica = 'receita_clube_por_unidade', r.eventos_min, NULL)) AS eventos_min_receita_clube_por_unidade,
  LOGICAL_OR(r.metrica = 'receita_clube_por_unidade' AND r.confirmado) AS confirmado_receita_clube_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.uplift_esperado, NULL)), 4) AS uplift_esperado_receita_clube_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.chance_melhor, NULL)), 4) AS chance_melhor_receita_clube_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.perda_ligar, NULL)), 5) AS perda_ligar_receita_clube_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_clube_por_unidade', r.perda_manter, NULL)), 5) AS perda_manter_receita_clube_por_unidade,
  MAX(IF(r.metrica = 'receita_clube_por_unidade', r.recomendacao, NULL)) AS recomendacao_receita_clube_por_unidade,
  LOGICAL_OR(r.metrica = 'receita_clube_por_unidade' AND r.cuped) AS cuped_receita_clube_por_unidade,
  -- churn_clube
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.valor, NULL)), 5) AS churn_clube,
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.uplift, NULL)), 4) AS uplift_churn_clube,
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.ic_lo, NULL)), 4) AS ic_lo_churn_clube,
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.ic_hi, NULL)), 4) AS ic_hi_churn_clube,
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.p_vence, NULL)), 4) AS p_vence_churn_clube,
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.mde, NULL)), 4) AS mde_churn_clube,
  MAX(IF(r.metrica = 'churn_clube', r.v, NULL)) AS var_churn_clube,
  MAX(IF(r.metrica = 'churn_clube', r.papel, NULL)) AS papel_churn_clube,
  MAX(IF(r.metrica = 'churn_clube', r.eventos_min, NULL)) AS eventos_min_churn_clube,
  LOGICAL_OR(r.metrica = 'churn_clube' AND r.confirmado) AS confirmado_churn_clube,
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.uplift_esperado, NULL)), 4) AS uplift_esperado_churn_clube,
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.chance_melhor, NULL)), 4) AS chance_melhor_churn_clube,
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.perda_ligar, NULL)), 5) AS perda_ligar_churn_clube,
  ROUND(MAX(IF(r.metrica = 'churn_clube', r.perda_manter, NULL)), 5) AS perda_manter_churn_clube,
  MAX(IF(r.metrica = 'churn_clube', r.recomendacao, NULL)) AS recomendacao_churn_clube,
  LOGICAL_OR(r.metrica = 'churn_clube' AND r.cuped) AS cuped_churn_clube,
  -- conversao_repet_nova
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.valor, NULL)), 5) AS conversao_repet_nova,
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.uplift, NULL)), 4) AS uplift_conversao_repet_nova,
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.ic_lo, NULL)), 4) AS ic_lo_conversao_repet_nova,
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.ic_hi, NULL)), 4) AS ic_hi_conversao_repet_nova,
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.p_vence, NULL)), 4) AS p_vence_conversao_repet_nova,
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.mde, NULL)), 4) AS mde_conversao_repet_nova,
  MAX(IF(r.metrica = 'conversao_repet_nova', r.v, NULL)) AS var_conversao_repet_nova,
  MAX(IF(r.metrica = 'conversao_repet_nova', r.papel, NULL)) AS papel_conversao_repet_nova,
  MAX(IF(r.metrica = 'conversao_repet_nova', r.eventos_min, NULL)) AS eventos_min_conversao_repet_nova,
  LOGICAL_OR(r.metrica = 'conversao_repet_nova' AND r.confirmado) AS confirmado_conversao_repet_nova,
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.uplift_esperado, NULL)), 4) AS uplift_esperado_conversao_repet_nova,
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.chance_melhor, NULL)), 4) AS chance_melhor_conversao_repet_nova,
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.perda_ligar, NULL)), 5) AS perda_ligar_conversao_repet_nova,
  ROUND(MAX(IF(r.metrica = 'conversao_repet_nova', r.perda_manter, NULL)), 5) AS perda_manter_conversao_repet_nova,
  MAX(IF(r.metrica = 'conversao_repet_nova', r.recomendacao, NULL)) AS recomendacao_conversao_repet_nova,
  LOGICAL_OR(r.metrica = 'conversao_repet_nova' AND r.cuped) AS cuped_conversao_repet_nova,
  -- conversao_saude
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.valor, NULL)), 5) AS conversao_saude,
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.uplift, NULL)), 4) AS uplift_conversao_saude,
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.ic_lo, NULL)), 4) AS ic_lo_conversao_saude,
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.ic_hi, NULL)), 4) AS ic_hi_conversao_saude,
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.p_vence, NULL)), 4) AS p_vence_conversao_saude,
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.mde, NULL)), 4) AS mde_conversao_saude,
  MAX(IF(r.metrica = 'conversao_saude', r.v, NULL)) AS var_conversao_saude,
  MAX(IF(r.metrica = 'conversao_saude', r.papel, NULL)) AS papel_conversao_saude,
  MAX(IF(r.metrica = 'conversao_saude', r.eventos_min, NULL)) AS eventos_min_conversao_saude,
  LOGICAL_OR(r.metrica = 'conversao_saude' AND r.confirmado) AS confirmado_conversao_saude,
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.uplift_esperado, NULL)), 4) AS uplift_esperado_conversao_saude,
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.chance_melhor, NULL)), 4) AS chance_melhor_conversao_saude,
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.perda_ligar, NULL)), 5) AS perda_ligar_conversao_saude,
  ROUND(MAX(IF(r.metrica = 'conversao_saude', r.perda_manter, NULL)), 5) AS perda_manter_conversao_saude,
  MAX(IF(r.metrica = 'conversao_saude', r.recomendacao, NULL)) AS recomendacao_conversao_saude,
  LOGICAL_OR(r.metrica = 'conversao_saude' AND r.cuped) AS cuped_conversao_saude,
  -- vidas_por_unidade
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.valor, NULL)), 5) AS vidas_por_unidade,
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.uplift, NULL)), 4) AS uplift_vidas_por_unidade,
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.ic_lo, NULL)), 4) AS ic_lo_vidas_por_unidade,
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.ic_hi, NULL)), 4) AS ic_hi_vidas_por_unidade,
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.p_vence, NULL)), 4) AS p_vence_vidas_por_unidade,
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.mde, NULL)), 4) AS mde_vidas_por_unidade,
  MAX(IF(r.metrica = 'vidas_por_unidade', r.v, NULL)) AS var_vidas_por_unidade,
  MAX(IF(r.metrica = 'vidas_por_unidade', r.papel, NULL)) AS papel_vidas_por_unidade,
  MAX(IF(r.metrica = 'vidas_por_unidade', r.eventos_min, NULL)) AS eventos_min_vidas_por_unidade,
  LOGICAL_OR(r.metrica = 'vidas_por_unidade' AND r.confirmado) AS confirmado_vidas_por_unidade,
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.uplift_esperado, NULL)), 4) AS uplift_esperado_vidas_por_unidade,
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.chance_melhor, NULL)), 4) AS chance_melhor_vidas_por_unidade,
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.perda_ligar, NULL)), 5) AS perda_ligar_vidas_por_unidade,
  ROUND(MAX(IF(r.metrica = 'vidas_por_unidade', r.perda_manter, NULL)), 5) AS perda_manter_vidas_por_unidade,
  MAX(IF(r.metrica = 'vidas_por_unidade', r.recomendacao, NULL)) AS recomendacao_vidas_por_unidade,
  LOGICAL_OR(r.metrica = 'vidas_por_unidade' AND r.cuped) AS cuped_vidas_por_unidade,
  -- receita_saude_por_unidade
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.valor, NULL)), 5) AS receita_saude_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.uplift, NULL)), 4) AS uplift_receita_saude_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.ic_lo, NULL)), 4) AS ic_lo_receita_saude_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.ic_hi, NULL)), 4) AS ic_hi_receita_saude_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.p_vence, NULL)), 4) AS p_vence_receita_saude_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.mde, NULL)), 4) AS mde_receita_saude_por_unidade,
  MAX(IF(r.metrica = 'receita_saude_por_unidade', r.v, NULL)) AS var_receita_saude_por_unidade,
  MAX(IF(r.metrica = 'receita_saude_por_unidade', r.papel, NULL)) AS papel_receita_saude_por_unidade,
  MAX(IF(r.metrica = 'receita_saude_por_unidade', r.eventos_min, NULL)) AS eventos_min_receita_saude_por_unidade,
  LOGICAL_OR(r.metrica = 'receita_saude_por_unidade' AND r.confirmado) AS confirmado_receita_saude_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.uplift_esperado, NULL)), 4) AS uplift_esperado_receita_saude_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.chance_melhor, NULL)), 4) AS chance_melhor_receita_saude_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.perda_ligar, NULL)), 5) AS perda_ligar_receita_saude_por_unidade,
  ROUND(MAX(IF(r.metrica = 'receita_saude_por_unidade', r.perda_manter, NULL)), 5) AS perda_manter_receita_saude_por_unidade,
  MAX(IF(r.metrica = 'receita_saude_por_unidade', r.recomendacao, NULL)) AS recomendacao_receita_saude_por_unidade,
  LOGICAL_OR(r.metrica = 'receita_saude_por_unidade' AND r.cuped) AS cuped_receita_saude_por_unidade,
  -- ticket_saude
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.valor, NULL)), 5) AS ticket_saude,
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.uplift, NULL)), 4) AS uplift_ticket_saude,
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.ic_lo, NULL)), 4) AS ic_lo_ticket_saude,
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.ic_hi, NULL)), 4) AS ic_hi_ticket_saude,
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.p_vence, NULL)), 4) AS p_vence_ticket_saude,
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.mde, NULL)), 4) AS mde_ticket_saude,
  MAX(IF(r.metrica = 'ticket_saude', r.v, NULL)) AS var_ticket_saude,
  MAX(IF(r.metrica = 'ticket_saude', r.papel, NULL)) AS papel_ticket_saude,
  MAX(IF(r.metrica = 'ticket_saude', r.eventos_min, NULL)) AS eventos_min_ticket_saude,
  LOGICAL_OR(r.metrica = 'ticket_saude' AND r.confirmado) AS confirmado_ticket_saude,
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.uplift_esperado, NULL)), 4) AS uplift_esperado_ticket_saude,
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.chance_melhor, NULL)), 4) AS chance_melhor_ticket_saude,
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.perda_ligar, NULL)), 5) AS perda_ligar_ticket_saude,
  ROUND(MAX(IF(r.metrica = 'ticket_saude', r.perda_manter, NULL)), 5) AS perda_manter_ticket_saude,
  MAX(IF(r.metrica = 'ticket_saude', r.recomendacao, NULL)) AS recomendacao_ticket_saude,
  LOGICAL_OR(r.metrica = 'ticket_saude' AND r.cuped) AS cuped_ticket_saude,
  -- churn_saude
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.valor, NULL)), 5) AS churn_saude,
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.uplift, NULL)), 4) AS uplift_churn_saude,
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.ic_lo, NULL)), 4) AS ic_lo_churn_saude,
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.ic_hi, NULL)), 4) AS ic_hi_churn_saude,
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.p_vence, NULL)), 4) AS p_vence_churn_saude,
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.mde, NULL)), 4) AS mde_churn_saude,
  MAX(IF(r.metrica = 'churn_saude', r.v, NULL)) AS var_churn_saude,
  MAX(IF(r.metrica = 'churn_saude', r.papel, NULL)) AS papel_churn_saude,
  MAX(IF(r.metrica = 'churn_saude', r.eventos_min, NULL)) AS eventos_min_churn_saude,
  LOGICAL_OR(r.metrica = 'churn_saude' AND r.confirmado) AS confirmado_churn_saude,
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.uplift_esperado, NULL)), 4) AS uplift_esperado_churn_saude,
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.chance_melhor, NULL)), 4) AS chance_melhor_churn_saude,
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.perda_ligar, NULL)), 5) AS perda_ligar_churn_saude,
  ROUND(MAX(IF(r.metrica = 'churn_saude', r.perda_manter, NULL)), 5) AS perda_manter_churn_saude,
  MAX(IF(r.metrica = 'churn_saude', r.recomendacao, NULL)) AS recomendacao_churn_saude,
  LOGICAL_OR(r.metrica = 'churn_saude' AND r.cuped) AS cuped_churn_saude,
  -- conversao_carrinho
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.valor, NULL)), 5) AS conversao_carrinho,
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.uplift, NULL)), 4) AS uplift_conversao_carrinho,
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.ic_lo, NULL)), 4) AS ic_lo_conversao_carrinho,
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.ic_hi, NULL)), 4) AS ic_hi_conversao_carrinho,
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.p_vence, NULL)), 4) AS p_vence_conversao_carrinho,
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.mde, NULL)), 4) AS mde_conversao_carrinho,
  MAX(IF(r.metrica = 'conversao_carrinho', r.v, NULL)) AS var_conversao_carrinho,
  MAX(IF(r.metrica = 'conversao_carrinho', r.papel, NULL)) AS papel_conversao_carrinho,
  MAX(IF(r.metrica = 'conversao_carrinho', r.eventos_min, NULL)) AS eventos_min_conversao_carrinho,
  LOGICAL_OR(r.metrica = 'conversao_carrinho' AND r.confirmado) AS confirmado_conversao_carrinho,
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.uplift_esperado, NULL)), 4) AS uplift_esperado_conversao_carrinho,
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.chance_melhor, NULL)), 4) AS chance_melhor_conversao_carrinho,
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.perda_ligar, NULL)), 5) AS perda_ligar_conversao_carrinho,
  ROUND(MAX(IF(r.metrica = 'conversao_carrinho', r.perda_manter, NULL)), 5) AS perda_manter_conversao_carrinho,
  MAX(IF(r.metrica = 'conversao_carrinho', r.recomendacao, NULL)) AS recomendacao_conversao_carrinho,
  LOGICAL_OR(r.metrica = 'conversao_carrinho' AND r.cuped) AS cuped_conversao_carrinho
FROM rec r
JOIN janela j USING (stream, campanha)
LEFT JOIN dupes dp USING (stream, campanha)
GROUP BY r.grao, r.stream, r.bu, r.campanha, r.device, r.variacao
ORDER BY r.campanha, r.grao, IF(r.device = 'Total', 0, 1), r.device, is_controle DESC, r.variacao;
