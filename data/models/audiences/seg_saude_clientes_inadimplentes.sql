-- ============================================================================
-- Segmento: clientes_inadimplentes
-- Clientes do plano de saúde com fatura vencida há mais de N dias, na posição
-- de hoje da base de cobrança (Vindi). Uma linha por cliente, com cuid para a DY.
--
-- Parâmetro (BigQuery nomeado, passado pelo Faro; nunca concatenado no texto):
--   @dias_inadimplencia  INT64  "mais de N dias de atraso"  (padrão 60)
--
-- Fonte:  op_health.dts_inadimplentes_vindi — retrato diário; vale o último
--         data_processamento. maximo_dias_vencido é calculado até essa data.
-- Chave:  vindi_customer_id (Vindi) -> dim_cliente.vindi_customer -> public_id (= cuid na DY).
--
-- Grão: 1 linha por cliente (cuid único, não nulo).
-- Cobertura: ~98% dos inadimplentes com mais de 60 dias casam com a dim_cliente;
--            os demais não têm public_id e ficam de fora.
-- ============================================================================

WITH ultimo AS (
  SELECT MAX(data_processamento) AS d
  FROM `petlove-dataeng-prod-01.op_health.dts_inadimplentes_vindi`
),

inadimplentes AS (
  SELECT
    CAST(i.vindi_customer_id AS STRING) AS vindi_customer,
    MAX(i.maximo_dias_vencido) AS dias_atraso
  FROM `petlove-dataeng-prod-01.op_health.dts_inadimplentes_vindi` i, ultimo
  WHERE i.data_processamento = ultimo.d
    AND i.maximo_dias_vencido > @dias_inadimplencia
  GROUP BY 1
)

SELECT
  cli.public_id AS cuid,          -- identificador que a DY reconhece
  cli.chv_cliente,                -- chave do DW
  inad.dias_atraso
FROM inadimplentes inad
JOIN `petlove-dataeng-prod-01.dw_corporativo.dim_cliente` cli
  ON cli.vindi_customer = inad.vindi_customer
WHERE cli.public_id IS NOT NULL
QUALIFY ROW_NUMBER() OVER (PARTITION BY cli.public_id ORDER BY inad.dias_atraso DESC) = 1
