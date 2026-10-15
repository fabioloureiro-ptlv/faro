// E8 (0.4.0) — mapa entre os nomes de métrica das consultas do roadmap v3 (dy_results.sql)
// e os `metricId` do catálogo do Faro (fixtures/metrics-catalog.json). Mesmo id nos dois
// grãos; o grão vai em `grain`. Compartilhado entre o sync (injeção da NORTE) e o adapter.
export const ROADMAP_METRIC_TO_FARO: Readonly<Record<string, string>> = {
  receita_por_unidade: 'receita_por_usuario',
  conversao: 'conversao',
  transacoes_por_unidade: 'transacoes_por_usuario',
  ticket: 'ticket_medio',
  receita_bruta_faturada_por_unidade: 'receita_faturada_por_usuario',
  margem2_por_unidade: 'margem_2_por_usuario',
  conversao_carrinho: 'conversao_carrinho',
  conversao_repet_nova: 'conversao_repet_nova',
  conversao_clube: 'conversao_clube',
  receita_clube_por_unidade: 'receita_clube_por_usuario',
  churn_clube: 'churn_clube',
  conversao_saude: 'conversao_saude',
  vidas_por_unidade: 'vidas_por_usuario',
  receita_saude_por_unidade: 'receita_saude_por_usuario',
  ticket_saude: 'ticket_saude',
  churn_saude: 'churn_saude',
};

export const FARO_METRIC_TO_ROADMAP: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ROADMAP_METRIC_TO_FARO).map(([sql, faro]) => [faro, sql]),
);

/** Nomes de métrica do SQL, na ordem do mapa (a ordem de exibição por seção fica com o catálogo). */
export const ROADMAP_METRICS: readonly string[] = Object.keys(ROADMAP_METRIC_TO_FARO);

/** Prefixos das colunas por métrica em dy_results.sql: `<prefixo><m>` (o valor é a coluna sem prefixo). */
export const ROADMAP_STAT_PREFIXES = [
  'uplift_',
  'ic_lo_',
  'ic_hi_',
  'p_vence_',
  'mde_',
  'var_',
  'papel_',
  'eventos_min_',
  'confirmado_',
  'uplift_esperado_',
  'chance_melhor_',
  'perda_ligar_',
  'perda_manter_',
  'recomendacao_',
  'cuped_',
] as const;

/** Versão das consultas do roadmap que o Faro lê (linhagem). Atualizar quando a v4 substituir a v3. */
export const ROADMAP_SQL_VERSION = 'v3 (2026-10-11)';
export const ROADMAP_SQL_REF = 'data/models/results/dy_results.sql';
export const ROADMAP_SOURCE_TABLES =
  'dw_corporativo.ft_teste_ab + ssot_ga4.events (+ ft_transacoes_marketing, op_digital_analytics.dts_transacoes_faturado, op_health.beneficiarios, ft_cancelamentos_clube_descontos)';
