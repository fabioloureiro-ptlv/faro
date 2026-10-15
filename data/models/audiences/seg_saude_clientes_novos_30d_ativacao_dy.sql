-- ============================================================================
-- Ativação DY do segmento: seg_saude_clientes_novos_30d
-- Entrega o segmento com os identificadores que a Dynamic Yield entende:
--   - cuid  = dim_cliente.public_id (a DY identifica o visitante por esse id
--             nos eventos "Identify User" / "Login", cuidType = customerid)
--   - dyid  = id de dispositivo DY já observado para o cliente (quando houver)
--
-- Autor:   Fabio Loureiro
-- Criado:  2026-10-14
-- Desafio: desafios/2026-10-14-clientes-novos-saude.md
-- Doc:     segmentos/seg_saude_clientes_novos_30d.md (seção Ativação)
--
-- Grão: 1 linha por cliente.
-- Cobertura medida em 2026-10-14: 100% com cuid; ~20% com dyid histórico
-- (janela de 60 dias de eventos Identify User). A ativação recomendada é por
-- cuid (upload de audiência / targeting por User Data na DY), que também
-- alcança quem só se identificar depois da subida da lista.
-- ============================================================================

WITH historico AS (
  SELECT
    chv_cliente,
    MIN(DATE(dt_aquisicao_plano)) AS dt_primeiro_plano
  FROM `petlove-dataeng-prod-01.dw_corporativo.ft_venda_plano_saude`
  WHERE fl_venda_realizada = 1
    AND chv_cliente IS NOT NULL
  GROUP BY chv_cliente
),

ativos_b2c AS (
  SELECT DISTINCT chv_cliente
  FROM `petlove-dataeng-prod-01.dw_corporativo.ft_venda_plano_saude`
  WHERE fl_venda_realizada = 1
    AND fl_plano_ativo = 1
    AND tipo_negocio = 'B2C'
    AND nm_portfolio = 'Petlove Saúde'
),

segmento AS (
  SELECT
    h.chv_cliente,
    h.dt_primeiro_plano
  FROM historico h
  JOIN ativos_b2c USING (chv_cliente)
  WHERE h.dt_primeiro_plano >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
),

-- dyid <- cuid observado nos eventos de identificação da DY (janela 60d)
mapa_dy AS (
  SELECT DISTINCT
    JSON_VALUE(event_properties, '$.cuid') AS public_id,
    dyid
  FROM `petlove-dataeng-prod-01.ssot_dynamic_yield.dpx`
  WHERE refdate >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
    AND event_name = 'Identify User'
),

clientes AS (
  SELECT DISTINCT chv_cliente, public_id
  FROM `petlove-dataeng-prod-01.dw_corporativo.dim_cliente`
  WHERE public_id IS NOT NULL
)

SELECT
  s.chv_cliente,
  c.public_id AS cuid,                                  -- identificador para a DY
  s.dt_primeiro_plano,
  DATE_DIFF(CURRENT_DATE(), s.dt_primeiro_plano, DAY) AS dias_como_cliente,
  -- Marcação Controle/Teste (REGRAS.md § 5.1): 50% controle, mesmo hash/salt da
  -- query principal do segmento — a marcação é idêntica nas duas queries.
  CASE
    WHEN MOD(ABS(FARM_FINGERPRINT(CONCAT(s.chv_cliente, 'seg_saude_clientes_novos_30d'))), 100) < 50
    THEN 'controle' ELSE 'teste'
  END AS grupo_ab,
  COUNT(m.dyid) AS n_dyids,                             -- dispositivos já vistos na DY
  STRING_AGG(m.dyid, ',') AS dyids                      -- nulo = nunca identificado na DY
FROM segmento s
JOIN clientes c USING (chv_cliente)
LEFT JOIN mapa_dy m ON c.public_id = m.public_id
GROUP BY 1, 2, 3, 4, 5
ORDER BY s.dt_primeiro_plano DESC
