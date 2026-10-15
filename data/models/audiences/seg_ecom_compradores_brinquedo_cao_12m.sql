-- ============================================================================
-- Segmento: seg_ecom_compradores_brinquedo_cao_12m
-- Donos de cachorro compradores de brinquedo: clientes com ao menos 1 compra
-- faturada em categoria cachorro/brinquedos/* nos últimos 12 meses.
-- Inclui cuid para ativação na DY e marcação Controle/Teste 50/50.
--
-- Autor:   Fabio Loureiro
-- Criado:  2026-10-14
-- Desafio: desafios/2026-10-14-lancamento-marca-brinquedos.md
-- Doc:     segmentos/seg_ecom_compradores_brinquedo_cao_12m.md
--
-- Grão: 1 linha por cliente.
-- Janela rolante: 365 dias para trás a partir de CURRENT_DATE().
-- ============================================================================

WITH compradores AS (
  SELECT
    f.chv_cliente,
    MIN(DATE(f.timestamp_data_captado)) AS dt_primeira_compra_brinquedo_12m,
    MAX(DATE(f.timestamp_data_captado)) AS dt_ultima_compra_brinquedo,
    COUNT(DISTINCT DATE(f.timestamp_data_captado)) AS n_dias_com_compra_brinquedo,
    ROUND(SUM(f.receita_bruta_produto), 2) AS receita_brinquedos_12m
  FROM `petlove-dataeng-prod-01.dw_corporativo.ft_pedido_faturado` f
  JOIN `petlove-dataeng-prod-01.dw_corporativo.dim_produto` p
    USING (chv_produto)
  WHERE DATE(f.timestamp_data_captado) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
    AND f.chv_cliente IS NOT NULL
    AND p.site_categoria_1 = 'cachorro'
    AND LOWER(p.site_categoria) LIKE '%brinquedo%'
  GROUP BY f.chv_cliente
),

clientes AS (
  SELECT DISTINCT chv_cliente, public_id
  FROM `petlove-dataeng-prod-01.dw_corporativo.dim_cliente`
  WHERE public_id IS NOT NULL
)

SELECT
  c.chv_cliente,                                        -- chave do segmento
  cli.public_id AS cuid,                                -- identificador para a DY
  c.dt_ultima_compra_brinquedo,
  c.n_dias_com_compra_brinquedo,
  c.receita_brinquedos_12m,
  -- Marcação Controle/Teste (REGRAS.md § 5.1): 50% controle, hash determinístico
  -- com salt = nome do segmento. Não alterar após o início do teste.
  CASE
    WHEN MOD(ABS(FARM_FINGERPRINT(CONCAT(c.chv_cliente, 'seg_ecom_compradores_brinquedo_cao_12m'))), 100) < 50
    THEN 'controle' ELSE 'teste'
  END AS grupo_ab
FROM compradores c
LEFT JOIN clientes cli
  USING (chv_cliente)
ORDER BY c.dt_ultima_compra_brinquedo DESC
