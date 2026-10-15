// Ficha de configuração do DY (CFG-11). Tudo vem do Faro: o operador só copia.
import type {
  DyCampaignType,
  DySheet,
  DySheetBlock,
  Experiment,
  MetricDefinition,
  PageCatalogEntry,
  Platform,
} from '@faro/contracts';

const PLATFORM_NAME: Record<Platform, string> = { site: 'Site', android: 'App Android', ios: 'App iOS' };
const CAMPAIGN_TYPE_NAME: Record<DyCampaignType, string> = {
  custom_code: 'Custom Code',
  api_custom: 'API Custom',
  recommendation: 'Recomendação',
};

// DECISAO-PENDENTE: equivalência métrica Faro → métrica primária do DY. Mapa local até a frente 4
// expor o campo no catálogo (PEDIDOS.md). Métrica sem equivalente vira evento customizado.
const DY_PRIMARY_METRIC: Record<string, string> = {
  receita_por_usuario: 'Revenue',
  receita_faturada_por_usuario: 'Revenue',
  conversao: 'Purchases',
  transacoes_por_usuario: 'Purchases',
  conversao_carrinho: 'Add to Cart',
  cliques_recomendacao: 'CTR',
};

export function dyPrimaryMetric(metricId: string): string {
  return DY_PRIMARY_METRIC[metricId] ?? `Custom Event: faro_${metricId}`;
}

// DECISAO-PENDENTE: tipo de campanha sugerido pela plataforma (site → Custom Code; só app → API Custom).
// Tipos e campos por tipo dependem da pergunta aberta 1 da frente.
export function suggestCampaignType(platforms: Platform[]): DyCampaignType {
  return platforms.includes('site') ? 'custom_code' : 'api_custom';
}

// DECISAO-PENDENTE: convenção de nome de variação, a validar com Analytics (seção 7).
// O faroId no nome permite à frente 4 ler o teste por `variationName` no GA4.
export function variationNames(exp: Pick<Experiment, 'faroId' | 'design' | 'legacy'>): string[] {
  if (exp.legacy) return [exp.design.control.name, ...exp.design.variants.map((v) => v.name)];
  return [`${exp.faroId}:controle`, ...exp.design.variants.map((v) => `${exp.faroId}:${v.key}`)];
}

export function campaignName(exp: Pick<Experiment, 'faroId' | 'name'>): string {
  return `${exp.faroId} | ${exp.name}`;
}

export function dyLabels(exp: Pick<Experiment, 'faroId' | 'bu' | 'ownerSquad'>): string[] {
  return [`faro:${exp.faroId}`, `bu:${exp.bu}`, `squad:${exp.ownerSquad}`];
}

export function apiSelector(faroId: string): string {
  return faroId.toLowerCase();
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`.replace('.', ',');
const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');

export interface DySheetContext {
  metric: Pick<MetricDefinition, 'id' | 'name'> | undefined;
  pages: PageCatalogEntry[];
  generatedAt: string;
}

export function buildDySheet(exp: Experiment, ctx: DySheetContext): DySheet {
  const a = exp.allocation;
  const type = exp.dy?.campaignType ?? suggestCampaignType(a.platforms);
  const names = variationNames(exp);
  const pageName = (id: string) => ctx.pages.find((p) => p.id === id)?.name ?? id;

  const blocks: DySheetBlock[] = [
    { key: 'campaign_name', label: 'Nome da campanha', value: campaignName(exp) },
    { key: 'labels', label: 'Labels', value: dyLabels(exp).join('\n'), hint: 'Um label por linha. O label faro: é o que liga a campanha ao Faro.' },
    { key: 'campaign_type', label: 'Tipo de campanha', value: CAMPAIGN_TYPE_NAME[type] },
    {
      key: 'selector',
      label: type === 'api_custom' ? 'API selector' : 'Nome do seletor',
      value: exp.dy?.selector ?? apiSelector(exp.faroId),
      hint: 'O mesmo identificador que o time de front/app usa para pedir a variação.',
    },
    { key: 'pages', label: 'Páginas', value: a.pages.map((p) => `${pageName(p)} (${p})`).join('\n') },
    { key: 'platforms', label: 'Plataformas', value: a.platforms.map((p) => PLATFORM_NAME[p]).join('\n') },
    {
      key: 'audience',
      label: 'Regra de público',
      value: exp.audience.dyAttribute ? `${exp.audience.dyAttribute} = true` : 'Todos os usuários (sem regra)',
      hint: exp.audience.description,
    },
    { key: 'traffic', label: 'Tráfego alocado', value: `${a.trafficPercent}%` },
    { key: 'variations', label: 'Variações', value: names.join('\n'), hint: 'Crie as variações com estes nomes, nesta ordem.' },
    {
      key: 'split',
      label: 'Split e controle',
      value: [...names.map((n, i) => `${n}: ${pct(a.split[i] ?? 0)}`), `Controle: ${names[0]}`].join('\n'),
    },
    {
      key: 'primary_metric',
      label: 'Métrica primária no DY',
      value: dyPrimaryMetric(exp.design.primaryMetricId),
      hint: `NORTE no Faro: ${ctx.metric?.name ?? exp.design.primaryMetricId}. A decisão é tomada pelo Faro.`,
    },
    { key: 'dates', label: 'Datas', value: `Início: ${ddmmyyyy(a.startDate)}\nFim: ${ddmmyyyy(a.endDate)}` },
  ];

  return { faroId: exp.faroId, generatedAt: ctx.generatedAt, blocks };
}

export function dySheetToMarkdown(sheet: DySheet): string {
  const out = [`# Ficha de configuração do DY — ${sheet.faroId}`, '', `Gerada em ${sheet.generatedAt}.`, ''];
  for (const b of sheet.blocks) {
    out.push(`## ${b.label}`, '', '```', b.value, '```', '');
    if (b.hint) out.push(`> ${b.hint}`, '');
  }
  return out.join('\n');
}
