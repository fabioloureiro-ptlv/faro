-- Reconciliação com a base do Hórus: petlove-dataeng-prod-01.op_dashs_interativos.dts_teste_ab
-- (agregada por experiência × variante × plataforma × dia; partição data_processamento = event_date do GA).
-- Objetivo: (1) achar o nome exato da campanha do Nexus; (2) comparar volumes com fixtures/nexus.json.

-- ============================================================
-- 1. Campanhas ativas nos últimos 14 dias, por variante e plataforma
-- ============================================================
SELECT
  nm_campanha,
  nm_experiencia,
  nm_variante,
  nm_plataforma,
  nm_unidade_negocio,
  MIN(data_processamento) AS primeiro_dia,
  MAX(data_processamento) AS ultimo_dia,
  SUM(num_sessoes)        AS sessoes
FROM `petlove-dataeng-prod-01.op_dashs_interativos.dts_teste_ab`
WHERE data_processamento BETWEEN '2026-09-30' AND '2026-10-13'
GROUP BY 1, 2, 3, 4, 5
ORDER BY sessoes DESC
LIMIT 200;

-- ============================================================
-- 2. Nexus na janela de leitura (31/08 a 12/10), por variante e plataforma
--    Ajuste o LIKE para o nome encontrado na consulta 1.
--    Comparar com fixtures/nexus.json (volumes): transações 1.995 × 464.349; receita R$ 467.283 × R$ 97.333.314 (consolidado).
-- ============================================================
SELECT
  nm_campanha,
  nm_variante,
  nm_plataforma,
  COUNT(DISTINCT data_processamento)       AS dias,
  SUM(num_sessoes)                         AS sessoes,
  SUM(num_transacao_geral)                 AS transacoes,
  SUM(num_transacao_ecomm)                 AS transacoes_ecom,
  SUM(vlr_receita_bruta_ecom)              AS receita_bruta_ecom,
  SUM(vlr_receita_ecom_captado)            AS receita_captada_ecom,
  SUM(vlr_margem2_ecom)                    AS margem2_ecom,
  SUM(num_carrinho)                        AS carrinho,
  SUM(num_transacao_novos_repet)           AS transacoes_novos_repet,
  SUM(num_transacao_clube)                 AS transacoes_clube,
  SUM(vlr_receita_clube_captado)           AS receita_clube,
  SUM(num_churn_clube)                     AS churn_clube,
  SUM(num_transacao_saude)                 AS transacoes_saude,
  SUM(num_pets_saude)                      AS pets_saude,
  SUM(vlr_receita_saude_captado)           AS receita_saude,
  SUM(vlr_total_faturado_saude)            AS faturado_saude,
  SUM(num_churn_saude)                     AS churn_saude
FROM `petlove-dataeng-prod-01.op_dashs_interativos.dts_teste_ab`
WHERE data_processamento BETWEEN '2026-08-31' AND '2026-10-12'
  AND LOWER(nm_campanha) LIKE '%home%'        -- trocar pelo nome exato do Nexus
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- ============================================================
-- 3. Série diária do Nexus (saúde do teste): sessões por variante e plataforma
-- ============================================================
SELECT
  data_processamento,
  nm_variante,
  nm_plataforma,
  SUM(num_sessoes) AS sessoes
FROM `petlove-dataeng-prod-01.op_dashs_interativos.dts_teste_ab`
WHERE data_processamento BETWEEN '2026-08-12' AND '2026-10-13'
  AND LOWER(nm_campanha) LIKE '%home%'        -- trocar pelo nome exato do Nexus
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
