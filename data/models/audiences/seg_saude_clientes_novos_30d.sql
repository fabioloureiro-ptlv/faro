-- ============================================================================
-- Segmento: seg_saude_clientes_novos_30d
-- Clientes novos no plano de saúde: primeira aquisição (na vida) nos últimos
-- 30 dias, B2C Petlove Saúde, com plano ativo na data de execução.
--
-- Autor:   Fabio Loureiro
-- Criado:  2026-10-14
-- Desafio: desafios/2026-10-14-clientes-novos-saude.md
-- Doc:     segmentos/seg_saude_clientes_novos_30d.md
--
-- Grão: 1 linha por cliente (chv_cliente).
-- Janela rolante: 30 dias para trás a partir de CURRENT_DATE().
-- ============================================================================

WITH historico AS (
  -- Primeira aquisição de plano do cliente em toda a vida (qualquer pet,
  -- qualquer tipo de negócio) — define se o cliente é "novo".
  SELECT
    chv_cliente,
    MIN(DATE(dt_aquisicao_plano)) AS dt_primeiro_plano
  FROM `petlove-dataeng-prod-01.dw_corporativo.ft_venda_plano_saude`
  WHERE fl_venda_realizada = 1
    AND chv_cliente IS NOT NULL
  GROUP BY chv_cliente
),

ativos_b2c AS (
  -- Planos ativos hoje, restritos ao escopo do segmento: B2C Petlove Saúde.
  SELECT
    chv_cliente,
    COUNT(DISTINCT chv_pet) AS n_pets_plano_ativo,
    MAX(DATE(dt_aquisicao_plano)) AS dt_ultima_aquisicao
  FROM `petlove-dataeng-prod-01.dw_corporativo.ft_venda_plano_saude`
  WHERE fl_venda_realizada = 1
    AND fl_plano_ativo = 1
    AND tipo_negocio = 'B2C'
    AND nm_portfolio = 'Petlove Saúde'
  GROUP BY chv_cliente
)

SELECT
  h.chv_cliente,                                                   -- chave do segmento
  h.dt_primeiro_plano,                                             -- regra: <= 30 dias
  DATE_DIFF(CURRENT_DATE(), h.dt_primeiro_plano, DAY) AS dias_como_cliente,
  a.n_pets_plano_ativo,
  a.dt_ultima_aquisicao,
  -- Marcação Controle/Teste (REGRAS.md § 5.1): 50% controle, hash determinístico
  -- com salt = nome do segmento. Estável entre execuções; não alterar após o
  -- início do teste.
  CASE
    WHEN MOD(ABS(FARM_FINGERPRINT(CONCAT(h.chv_cliente, 'seg_saude_clientes_novos_30d'))), 100) < 50
    THEN 'controle' ELSE 'teste'
  END AS grupo_ab
FROM historico h
JOIN ativos_b2c a
  USING (chv_cliente)
WHERE h.dt_primeiro_plano >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
ORDER BY h.dt_primeiro_plano DESC
