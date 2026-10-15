// Gera packages/contracts/fixtures/*.json a partir dos dados de docs/prototipo/faro-prototipo.html.
// Os valores do Nexus foram copiados do protótipo (export do DY de 13/10/2026). Os testes simulados
// usam o mesmo gerador determinístico do protótipo (rng seedado), portado para cá.
// Rodar: node packages/contracts/scripts/build-fixtures.ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Bu,
  Experiment,
  ExperimentStatus,
  MetricDefinition,
  MetricResult,
  Platform,
  SignificanceLabel,
} from '../src/domain.ts';
import type { AudienceShortcut, PageCatalog, Template } from '../src/catalogs.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const write = (name: string, data: unknown) =>
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + '\n');

// ---------------------------------------------------------------- catálogo de páginas
const PAGES: Record<string, { n: string; daily: number }> = {
  home: { n: 'Home', daily: 180000 },
  busca: { n: 'Busca', daily: 95000 },
  pdp: { n: 'Página de produto', daily: 140000 },
  carrinho: { n: 'Carrinho', daily: 42000 },
  checkout: { n: 'Checkout', daily: 21000 },
  saude: { n: 'Área Saúde', daily: 16000 },
  conta: { n: 'Minha conta', daily: 30000 },
};
const PLAT_SHARE: Record<Platform, number> = { site: 0.45, android: 0.35, ios: 0.2 };
const pages: PageCatalog = {
  pages: Object.entries(PAGES).map(([id, p]) => ({ id, name: p.n, dailyUsers: p.daily })),
  platformShare: PLAT_SHARE,
};

// ---------------------------------------------------------------- atalhos de público
const SEG: Record<string, { n: string; share: number }> = {
  todos: { n: 'Todos os clientes', share: 1 },
  novos: { n: 'Novos clientes', share: 0.28 },
  recorrentes: { n: 'Clientes recorrentes', share: 0.72 },
  repet: { n: 'Assinantes Repet', share: 0.38 },
  naorepet: { n: 'Não assinantes Repet', share: 0.62 },
  caes: { n: 'Tutores de cães', share: 0.68 },
  gatos: { n: 'Tutores de gatos', share: 0.44 },
  tapete: { n: 'Compradores de tapete higiênico', share: 0.09 },
  areia: { n: 'Compradores de areia para gatos', share: 0.14 },
  antipulgas: { n: 'Compradores de antipulgas', share: 0.12 },
};
const audiences: AudienceShortcut[] = Object.entries(SEG).map(([id, s]) => ({
  id,
  name: s.n,
  share: s.share,
  ...(id === 'todos' ? {} : { dyAttribute: `faro_publico_${id}` }),
}));

// ---------------------------------------------------------------- catálogo de métricas
type Row = {
  id: string;
  n: string;
  sec: MetricDefinition['section'];
  kind: 'rate' | 'val';
  base: number;
  cv?: number;
  unit?: MetricDefinition['unit'];
  lower?: boolean;
  perBuyer?: boolean;
  noSess?: boolean;
  def: string;
};
// Chave do protótipo -> métrica. Baselines e cv vêm de ROWS do protótipo.
const ROWS: Record<string, Row> = {
  rpu: { id: 'receita_por_usuario', n: 'Receita por usuário', sec: 'eCom', kind: 'val', base: 24.5, cv: 6, unit: 'brl', def: 'Receita total ÷ usuários expostos.' },
  conv: { id: 'conversao', n: 'Conversão', sec: 'eCom', kind: 'rate', base: 0.032, def: 'Usuários com ao menos um pedido ÷ usuários expostos.' },
  tpu: { id: 'transacoes_por_usuario', n: 'Transações por usuário', sec: 'eCom', kind: 'val', base: 0.092, cv: 4, unit: 'count', def: 'Pedidos ÷ usuários expostos.' },
  ticket: { id: 'ticket_medio', n: 'Ticket médio', sec: 'eCom', kind: 'val', base: 232, cv: 0.8, unit: 'brl', perBuyer: true, noSess: true, def: 'Receita ÷ pedidos.' },
  rfpu: { id: 'receita_faturada_por_usuario', n: 'Receita faturada por usuário', sec: 'eCom', kind: 'val', base: 29.4, cv: 6, unit: 'brl', def: 'Receita faturada ÷ usuários expostos.' },
  m2: { id: 'margem_2_por_usuario', n: 'Margem 2 por usuário', sec: 'eCom', kind: 'val', base: 4.1, cv: 7, unit: 'brl', def: 'Margem 2 ÷ usuários expostos.' },
  atc: { id: 'conversao_carrinho', n: 'Conversão para o carrinho', sec: 'eCom', kind: 'rate', base: 0.11, def: 'Usuários que adicionaram ao carrinho ÷ usuários expostos.' },
  repet: { id: 'conversao_repet_nova', n: 'Conversão em Repet nova', sec: 'eCom', kind: 'rate', base: 0.021, def: 'Usuários que criaram uma assinatura Repet ÷ usuários expostos.' },
  ctr: { id: 'cliques_recomendacao', n: 'Cliques na recomendação', sec: 'Engajamento', kind: 'rate', base: 0.06, def: 'Usuários que clicaram na recomendação ÷ usuários expostos.' },
  clube: { id: 'conversao_clube', n: 'Conversão no clube', sec: 'Clube', kind: 'rate', base: 0.0042, def: 'Usuários que aderiram ao clube ÷ usuários expostos.' },
  rclube: { id: 'receita_clube_por_usuario', n: 'Receita do clube por usuário', sec: 'Clube', kind: 'val', base: 0.71, cv: 12, unit: 'brl', def: 'Receita do clube ÷ usuários expostos.' },
  churnc: { id: 'churn_clube', n: 'Churn do clube', sec: 'Clube', kind: 'rate', base: 0.031, lower: true, noSess: true, def: 'Assinantes do clube que cancelaram ÷ assinantes expostos.' },
  saude: { id: 'conversao_saude', n: 'Conversão em saúde', sec: 'Saúde', kind: 'rate', base: 0.015, def: 'Usuários que contrataram plano de saúde ÷ usuários expostos.' },
  vidas: { id: 'vidas_por_usuario', n: 'Vidas por usuário', sec: 'Saúde', kind: 'val', base: 0.021, cv: 8, unit: 'count', def: 'Pets cobertos por plano de saúde ÷ usuários expostos.' },
  rsaude: { id: 'receita_saude_por_usuario', n: 'Receita de saúde por usuário', sec: 'Saúde', kind: 'val', base: 1.12, cv: 10, unit: 'brl', def: 'Receita de saúde ÷ usuários expostos.' },
  tsaude: { id: 'ticket_saude', n: 'Ticket de saúde', sec: 'Saúde', kind: 'val', base: 150, cv: 0.8, unit: 'brl', perBuyer: true, noSess: true, def: 'Receita de saúde ÷ contratações.' },
  churns: { id: 'churn_saude', n: 'Churn de saúde', sec: 'Saúde', kind: 'rate', base: 0.02, lower: true, noSess: true, def: 'Planos de saúde cancelados ÷ planos ativos expostos.' },
  ret30: { id: 'retencao_30d', n: 'Retenção em 30 dias', sec: 'eCom', kind: 'rate', base: 0.41, noSess: true, def: 'Usuários que voltam a comprar em até 30 dias ÷ usuários expostos.' },
  load: { id: 'tempo_carregamento', n: 'Tempo de carregamento', sec: 'Operação', kind: 'val', base: 1.82, cv: 0.45, unit: 'seconds', lower: true, noSess: true, def: 'Tempo médio até a página ficar interativa.' },
  sac: { id: 'chamados_sac', n: 'Chamados no SAC', sec: 'Atendimento', kind: 'rate', base: 0.006, lower: true, def: 'Usuários que abriram chamado ÷ usuários expostos.' },
  cancel: { id: 'cancelamento_repet', n: 'Cancelamento de Repet', sec: 'Operação', kind: 'rate', base: 0.042, lower: true, noSess: true, def: 'Assinaturas Repet canceladas ÷ assinaturas expostas.' },
  devol: { id: 'taxa_devolucao', n: 'Taxa de devolução', sec: 'Operação', kind: 'rate', base: 0.018, lower: true, noSess: true, def: 'Pedidos devolvidos ÷ pedidos.' },
};
// Métricas do protótipo que eram alias de ROWS.
const ALIAS: Record<string, string> = { rpv: 'rpu' };
const mid = (k: string) => ROWS[ALIAS[k] ?? k]!.id;

const metrics: MetricDefinition[] = Object.values(ROWS).map((r) => ({
  id: r.id,
  name: r.n,
  section: r.sec,
  kind: r.kind === 'rate' ? 'proportion' : 'mean',
  direction: r.lower ? 'lower_better' : 'higher_better',
  unit: r.kind === 'rate' ? 'percent' : (r.unit ?? 'count'),
  grains: r.noSess ? ['user'] : ['user', 'session'],
  definition: r.def,
  sqlTemplateRef: `data/models/metrics/${r.id}.sql`,
  ...(r.kind === 'rate' ? { baseline: r.base } : { baseline: r.base, cv: r.cv }),
  owner: 'frente-04',
  status: 'ativa',
}));

// ---------------------------------------------------------------- utilidades do protótipo
function phi(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function hash(t: string) {
  let h = 7;
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
  return h;
}
function gauss(r: () => number) {
  let u = 0;
  let v = 0;
  while (!u) u = r();
  while (!v) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function label(p: number): SignificanceLabel {
  if (p >= 0.95) return 'melhora_confirmada';
  if (p <= 0.05) return 'queda_confirmada';
  if (p >= 0.8) return 'tendencia_de_melhora';
  if (p <= 0.2) return 'tendencia_de_queda';
  return 'sem_tendencia';
}
const round = (x: number, d = 6) => Math.round(x * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------- experimentos do protótipo
type Proto = {
  id: string;
  faroId: string;
  bu: Bu;
  name: string;
  status: 'decided' | 'running' | 'scheduled' | 'finished';
  owner: string;
  pages: string[];
  platforms: Platform[];
  segment: string;
  traffic: number;
  start: string;
  end: string;
  primary: string;
  secondary: string[];
  guardrails: string[];
  mde: number;
  context: string;
  hypothesis: string;
  control: string;
  variant: string;
  scenario?: string;
  results?: { users: Partial<Record<Platform, [number, number]>>; crossed: number; base?: Record<string, number>; lifts: Record<string, number> };
  decision?: string;
};

const STATUS: Record<Proto['status'], ExperimentStatus> = {
  decided: 'decidido',
  running: 'rodando',
  scheduled: 'configurado_no_dy',
  finished: 'encerrado',
};

const SIMULATED: Proto[] = [
  { id: 'e1', faroId: 'FARO-2026-0002', scenario: 'melhora_confirmada_amostra_incompleta', bu: 'ecom', name: 'Frete grátis em destaque no carrinho', status: 'running', owner: 'Squad Checkout', pages: ['carrinho'], platforms: ['site', 'android', 'ios'], segment: 'todos', traffic: 50, start: '2026-09-30', end: '2026-10-28', primary: 'conv', secondary: ['ticket', 'atc'], guardrails: ['load'], mde: 5,
    context: 'Pesquisa de abandono mostrou que 41% dos clientes que saem do carrinho citam o valor do frete. Hoje a régua de frete grátis só aparece no checkout.',
    hypothesis: 'Se mostrarmos quanto falta para o frete grátis já no carrinho, a conversão do checkout vai aumentar, porque o cliente decide completar o pedido antes de ver o custo.',
    control: 'Carrinho atual, sem informação de frete', variant: 'Barra de progresso “faltam R$ X para frete grátis” no topo do carrinho',
    results: { users: { site: [66710, 66820], android: [51880, 51990], ios: [29620, 29645] }, crossed: 1840, base: { conv: 0.032 }, lifts: { conv: 0.055, ticket: -0.012, atc: 0.021, rpu: 0.042, tpu: 0.05, rfpu: 0.04, m2: 0.03, load: 0.001 } } },
  { id: 'e2', faroId: 'FARO-2026-0003', bu: 'ecom', name: 'Upsell de Repet na página de produto', status: 'running', owner: 'Squad Retenção', pages: ['pdp'], platforms: ['android', 'ios'], segment: 'naorepet', traffic: 30, start: '2026-10-05', end: '2026-11-02', primary: 'repet', secondary: ['conv', 'rpv'], guardrails: ['cancel'], mde: 8,
    context: 'Clientes não assinantes compram ração com recorrência de ~35 dias, mas só 6% conhecem o desconto do Repet na PDP.',
    hypothesis: 'Se o seletor “Compra programada” vier pré-selecionado na PDP de ração, a adesão ao Repet vai aumentar, porque reduz o esforço de escolha.',
    control: 'Compra única pré-selecionada', variant: 'Compra programada (Repet) pré-selecionada com economia em destaque',
    results: { users: { android: [38110, 37960], ios: [23230, 23142] }, crossed: 910, base: { repet: 0.021 }, lifts: { repet: 0.05, conv: -0.008, rpu: 0.014, cancel: 0.039 } } },
  { id: 'e3', faroId: 'FARO-2026-0004', scenario: 'srm', bu: 'saude', name: 'Onboarding da Área Saúde em 3 passos', status: 'running', owner: 'Squad Saúde', pages: ['saude', 'home'], platforms: ['android', 'ios'], segment: 'novos', traffic: 100, start: '2026-10-01', end: '2026-10-29', primary: 'saude', secondary: ['ret30'], guardrails: ['sac'], mde: 15,
    context: 'Novos clientes que entram na Área Saúde abandonam o cadastro do pet em 62% dos casos no formulário único atual.',
    hypothesis: 'Se quebrarmos o cadastro em 3 passos curtos, a ativação do plano Saúde vai aumentar, porque cada passo parece menor e mais fácil.',
    control: 'Formulário único com 11 campos', variant: 'Fluxo em 3 telas: pet, endereço, plano',
    results: { users: { android: [30520, 28790], ios: [18600, 17620] }, crossed: 420, base: { saude: 0.015 }, lifts: { saude: 0.14, ret30: 0, sac: -0.02, vidas: 0.1 } } },
  { id: 'e4', faroId: 'FARO-2026-0005', scenario: 'agendado_sem_dados', bu: 'ecom', name: 'Recomendação de ração por raça', status: 'scheduled', owner: 'Squad Descoberta', pages: ['pdp', 'home'], platforms: ['site', 'android'], segment: 'caes', traffic: 50, start: '2026-10-21', end: '2026-11-18', primary: 'ctr', secondary: ['atc', 'rpv'], guardrails: ['load'], mde: 10,
    context: 'O carrossel “Você também pode gostar” usa só histórico de navegação e tem CTR de 6%.',
    hypothesis: 'Se recomendarmos rações pela raça e porte cadastrados do pet, os cliques na recomendação vão aumentar, porque a sugestão fica mais relevante.',
    control: 'Carrossel atual por navegação', variant: 'Carrossel por raça e porte do pet cadastrado' },
  { id: 'e5', faroId: 'FARO-2026-0006', scenario: 'encerrado_com_vencedor', bu: 'ecom', name: 'Cupom de primeira compra no checkout', status: 'finished', owner: 'Squad Aquisição', pages: ['checkout'], platforms: ['site', 'android'], segment: 'novos', traffic: 50, start: '2026-09-01', end: '2026-09-29', primary: 'conv', secondary: ['ticket'], guardrails: ['devol'], mde: 12,
    context: 'Novos clientes convertem 30% menos que recorrentes e o cupom de boas-vindas só é enviado por e-mail.',
    hypothesis: 'Se o cupom de primeira compra for aplicado automaticamente no checkout, a conversão de novos clientes vai aumentar, porque elimina a busca pelo código.',
    control: 'Campo de cupom vazio', variant: 'Cupom aplicado automaticamente com aviso',
    results: { users: { site: [18300, 18232], android: [12200, 12148] }, crossed: 610, base: { conv: 0.0397 }, lifts: { conv: 0.113, ticket: -0.034, devol: 0.006, rpu: 0.07, tpu: 0.1 } },
    decision: 'Vencedor: Variante A. Implementado em 06/10.' },
  { id: 'e6', faroId: 'FARO-2026-0007', scenario: 'tendencia_sem_significancia', bu: 'fintech', name: 'Cashback Petlove na tela de pagamento', status: 'running', owner: 'Squad Fintech', pages: ['checkout', 'conta'], platforms: ['android', 'ios'], segment: 'recorrentes', traffic: 40, start: '2026-10-02', end: '2026-10-30', primary: 'conv', secondary: ['rpv'], guardrails: ['devol'], mde: 6,
    context: 'Clientes recorrentes que usam a carteira digital têm frequência 22% maior, mas só 9% conhecem o cashback, que hoje fica escondido em Minha conta.',
    hypothesis: 'Se mostrarmos o saldo e o cashback do pedido na tela de pagamento, então a conversão do checkout vai aumentar, porque o benefício fica visível na hora da decisão.',
    control: 'Pagamento sem menção ao cashback', variant: 'Bloco “Você ganha R$ X de cashback” acima dos meios de pagamento',
    results: { users: { android: [24800, 24710], ios: [15400, 15360] }, crossed: 380, base: { conv: 0.041 }, lifts: { conv: 0.03, rpu: 0.02, devol: 0 } } },
  { id: 'e7', faroId: 'FARO-2026-0008', bu: 'servicos', name: 'Agendamento de banho e tosa na home', status: 'scheduled', owner: 'Squad Serviços', pages: ['home'], platforms: ['site'], segment: 'caes', traffic: 30, start: '2026-10-26', end: '2026-11-23', primary: 'ctr', secondary: ['rpv'], guardrails: ['load'], mde: 12,
    context: 'Tutores de cães que agendam banho e tosa compram 1,6x mais no mês seguinte, mas o serviço só aparece em um menu secundário.',
    hypothesis: 'Se exibirmos um card de agendamento de banho e tosa na home, então os cliques vão aumentar, porque o serviço fica no caminho de quem já está comprando para o cão.',
    control: 'Home sem card de serviços', variant: 'Card “Agende banho e tosa perto de você” abaixo do banner principal' },
];

/** "Se X, (então) Y, porque Z." -> partes estruturadas. */
function splitHypothesis(h: string) {
  const m = /^Se (.+?), (?:então )?(.+?), porque (.+?)\.?$/i.exec(h.trim());
  if (!m) throw new Error(`Hipótese fora do formato: ${h}`);
  return { change: m[1]!, expectedEffect: m[2]!, because: m[3]! };
}

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function toExperiment(p: Proto): Experiment & { scenario?: string } {
  const seg = SEG[p.segment]!;
  const createdAt = `${p.start}T12:00:00-03:00`;
  return {
    faroId: p.faroId,
    name: p.name,
    bu: p.bu,
    ownerSquad: p.owner,
    ownerEmail: `${slug(p.owner)}@example.com`,
    status: STATUS[p.status],
    design: {
      context: p.context,
      hypothesis: splitHypothesis(p.hypothesis),
      control: { name: 'Controle', description: p.control },
      variants: [{ key: 'a', name: 'Variante A', description: p.variant }],
      primaryMetricId: mid(p.primary),
      secondaryMetricIds: p.secondary.map(mid),
      guardrailMetricIds: p.guardrails.map(mid),
      mdeRelative: p.mde / 100,
    },
    audience: {
      description: seg.n,
      source: 'atalho',
      estimatedShare: seg.share,
      ...(p.segment === 'todos' ? {} : { dyAttribute: `faro_publico_${p.segment}` }),
    },
    allocation: {
      platforms: p.platforms,
      pages: p.pages,
      trafficPercent: p.traffic,
      split: [0.5, 0.5],
      startDate: p.start,
      endDate: p.end,
    },
    dy: {
      campaignName: `${p.faroId} | ${p.name}`,
      campaignId: `dy-sim-${p.id}`,
      campaignType: p.platforms.includes('site') ? 'custom_code' : 'api_custom',
      labels: [`faro:${p.faroId}`, p.bu, p.owner],
      configuredAt: `${p.start}T09:00:00-03:00`,
      configuredBy: 'operador-dy@example.com',
    },
    ...(p.decision
      ? { decision: { outcome: 'implementar_variante' as const, rationale: p.decision, decidedBy: `${slug(p.owner)}@example.com`, decidedAt: '2026-10-06T10:00:00-03:00' } }
      : {}),
    legacy: false,
    createdAt,
    updatedAt: createdAt,
    ...(p.scenario ? { scenario: p.scenario } : {}),
  };
}

/** Porte de gen() + rstat() + MDE do protótipo, grão usuário. */
function simulatedResults(p: Proto): MetricResult[] {
  const R = p.results;
  if (!R) return [];
  const asOf = p.status === 'finished' ? p.end : '2026-10-13';
  const keys = new Set(['rpu', 'conv', 'tpu', 'ticket', 'rfpu', 'm2', 'atc', 'repet', 'clube', 'rclube', 'churnc', 'saude', 'vidas', 'rsaude']);
  [p.primary, ...p.secondary].forEach((m) => keys.add(ALIAS[m] ?? m));
  p.guardrails.forEach((g) => keys.add(g));
  const rowKeys = Object.keys(ROWS).filter((k) => keys.has(k));
  const nEff = (r: Row, n: number) => (r.perBuyer ? n * 0.05 : n);

  type Arm = { n: [number, number]; rows: Record<string, [number, number]> };
  const plats: Partial<Record<Platform, Arm>> = {};
  for (const plat of p.platforms) {
    const u = R.users[plat];
    if (!u) continue;
    const rows: Record<string, [number, number]> = {};
    for (const k of Object.keys(ROWS)) {
      const r = ROWS[k]!;
      const b = R.base?.[k] ?? r.base;
      const rnd = rng(hash(p.id + k + plat + 'usuario'));
      const c = b * (1 + gauss(rnd) * 0.05);
      const n0 = nEff(r, Math.min(...u));
      const se = r.kind === 'rate' ? Math.sqrt(((1 - c) / c) * 2 / n0) : r.cv! * Math.sqrt(2 / n0);
      rows[k] = [c, c * (1 + (R.lifts[k] ?? 0) + gauss(rnd) * se * 0.3)];
    }
    plats[plat] = { n: [u[0], u[1]], rows };
  }
  const ps = Object.values(plats) as Arm[];
  const nAll: [number, number] = [0, 1].map((i) => ps.reduce((s, x) => s + x.n[i]!, 0)) as [number, number];
  const rowsAll: Record<string, [number, number]> = {};
  for (const k of Object.keys(ROWS))
    rowsAll[k] = [0, 1].map((i) => ps.reduce((s, x) => s + x.rows[k]![i]! * x.n[i]!, 0) / nAll[i]!) as [number, number];

  const out: MetricResult[] = [];
  const emit = (platform: Platform | 'all', arm: Arm) => {
    for (const k of rowKeys) {
      const r = ROWS[k]!;
      const [c, v] = arm.rows[k]!;
      const [nc, nv] = arm.n;
      const a = nEff(r, nc);
      const b = nEff(r, nv);
      const se = r.kind === 'rate' ? Math.sqrt((c * (1 - c)) / a + (v * (1 - v)) / b) : Math.sqrt((c * r.cv!) ** 2 / a + (c * r.cv!) ** 2 / b);
      const z = (v - c) / se;
      const P = r.lower ? phi(-z) : phi(z);
      const nMin = nEff(r, Math.min(nc, nv));
      const mde = r.kind === 'rate' ? 2.8 * Math.sqrt((2 * (1 - c)) / (c * nMin)) : 2.8 * r.cv! * Math.sqrt(2 / nMin);
      out.push({ faroId: p.faroId, metricId: r.id, platform, grain: 'user', variantKey: 'controle', value: round(c), n: nc, asOf });
      out.push({ faroId: p.faroId, metricId: r.id, platform, grain: 'user', variantKey: 'a', value: round(v), n: nv, deltaRelative: round((v - c) / c), probBetter: round(P, 4), label: label(P), mde: round(mde, 4), asOf });
    }
  };
  emit('all', { n: nAll, rows: rowsAll });
  for (const [plat, arm] of Object.entries(plats)) emit(plat as Platform, arm!);
  return out;
}

// ---------------------------------------------------------------- Nexus (export real do DY, 13/10/2026)
type FixedRow = [string, number | null, number | null, number | null, string | null, number?];
const SG: Record<string, SignificanceLabel> = {
  up: 'melhora_confirmada',
  down: 'queda_confirmada',
  tup: 'tendencia_de_melhora',
  tdown: 'tendencia_de_queda',
  none: 'sem_tendencia',
};
const NEXUS_FIXED: Record<'all' | 'android' | 'ios', { users: [number, number]; rows: FixedRow[] }> = {
  all: {
    users: [21379, 1100094],
    rows: [['rpu', 21.83, 88.2, 108.1, 'up', 100], ['conv', 0.0746, 0.2549, 241.3, 'up', 100], ['tpu', 0.0933, 0.4221, 110.5, 'up', 100], ['ticket', 233.95, 208.97, -10.7, 'down', 0], ['rfpu', 29.18, 111.85, 92.2, 'up', 100], ['m2', 3.99, 13.08, 76.7, 'up', 100], ['atc', 0.1013, 0.3062, 202.2, 'up', 100], ['repet', 0.0002, 0.0022, 681.6, 'tup', 100],
      ['clube', 0.003, 0.0112, 267.3, 'up', 100], ['rclube', 0.66, 2.57, 288.6, 'up', 100], ['churnc', 0, 0.0363, 139.8, 'none', 19],
      ['saude', 0, 0, -74.7, 'tdown', 9], ['vidas', 0, 0, null, null], ['rsaude', 0, 0, null, null], ['tsaude', null, 158.59, null, null], ['churns', null, 0, null, null]],
  },
  android: {
    users: [8415, 592676],
    rows: [['rpu', 13.28, 80.23, 138.3, 'up', 100], ['conv', 0.0474, 0.2368, 398.4, 'up', 100], ['tpu', 0.0595, 0.3931, 136.2, 'up', 100], ['ticket', 223.03, 204.1, -8.5, 'down', 2], ['rfpu', 17.69, 103.35, 122.8, 'up', 100], ['m2', 2.29, 11.67, 106.3, 'up', 100], ['atc', 0.0778, 0.2922, 274.9, 'up', 100], ['repet', 0.0001, 0.0021, 779.1, 'tup', 100],
      ['clube', 0.0012, 0.0108, 727.7, 'tup', 100], ['rclube', 0.22, 2.42, 1009.9, 'tup', 100], ['churnc', 0, 0.0395, -52.4, 'none', 78],
      ['saude', 0, 0, -98.6, 'tdown', 0], ['vidas', 0, 0, null, null], ['rsaude', 0, 0, null, null]],
  },
  ios: {
    users: [12964, 507418],
    rows: [['rpu', 27.38, 97.51, 100.8, 'up', 100], ['conv', 0.0923, 0.2761, 198.8, 'up', 100], ['tpu', 0.1152, 0.456, 103.0, 'up', 100], ['ticket', 237.62, 213.87, -10.0, 'down', 0], ['rfpu', 36.65, 121.77, 82.6, 'up', 100], ['m2', 5.09, 14.72, 70.5, 'up', 100], ['atc', 0.1165, 0.3225, 176.8, 'up', 100], ['repet', 0.0003, 0.0023, 501.0, 'tup', 100],
      ['clube', 0.0042, 0.0116, 173.0, 'up', 100], ['rclube', 0.95, 2.75, 189.5, 'up', 100], ['churnc', 0, 0.0327, 84.1, 'none', 27],
      ['saude', 0, 0, -66.8, 'tdown', 14], ['vidas', 0, 0, null, null], ['rsaude', 0, 0, null, null], ['tsaude', null, 158.59, null, null], ['churns', null, 0, null, null]],
  },
};
const NEXUS_MDE: [string, number | null][] = [['rpu', 4.5], ['conv', 6.8], ['tpu', 3.4], ['ticket', 5.6], ['rfpu', 5.4], ['m2', 6.8], ['atc', 5.7], ['repet', 114.4], ['clube', 34.8], ['rclube', 42.0], ['churnc', 278.2], ['saude', 290.6], ['vidas', null], ['rsaude', null], ['tsaude', null], ['churns', null]];
const NEXUS_DAILY: [string, number, number][] = [['2026-09-30', 350, 17500], ['2026-10-01', 330, 16500], ['2026-10-02', 300, 15000], ['2026-10-03', 285, 14200], ['2026-10-04', 220, 11000], ['2026-10-05', 270, 13500], ['2026-10-06', 250, 12500], ['2026-10-07', 240, 12000], ['2026-10-08', 220, 11000], ['2026-10-09', 210, 10500], ['2026-10-10', 200, 10000], ['2026-10-11', 190, 9500], ['2026-10-12', 120, 6000], ['2026-10-13', 80, 4000]];

const NEXUS_ID = 'FARO-2026-0001';
const nexusMde = new Map(NEXUS_MDE);
const nexusResults: MetricResult[] = [];
for (const [platform, d] of Object.entries(NEXUS_FIXED) as ['all' | 'android' | 'ios', (typeof NEXUS_FIXED)['all']][]) {
  for (const [k, c, v, dl, sg, pp] of d.rows) {
    const id = ROWS[k]!.id;
    const mde = platform === 'all' ? nexusMde.get(k) : undefined;
    nexusResults.push({ faroId: NEXUS_ID, metricId: id, platform, grain: 'user', variantKey: 'controle', value: c, n: d.users[0], asOf: '2026-10-13' });
    nexusResults.push({
      faroId: NEXUS_ID,
      metricId: id,
      platform,
      grain: 'user',
      variantKey: 'a',
      value: v,
      n: d.users[1],
      ...(dl != null ? { deltaRelative: round(dl / 100, 4) } : {}),
      ...(pp != null ? { probBetter: pp / 100 } : {}),
      ...(sg ? { label: SG[sg] } : {}),
      ...(mde != null ? { mde: round(mde / 100, 4) } : {}),
      asOf: '2026-10-13',
    });
  }
}
const totalAll = NEXUS_FIXED.all.users[0] + NEXUS_FIXED.all.users[1];

const nexus = {
  source: 'Export D-1 do Dynamic Yield de 13/10/2026, copiado do protótipo (docs/prototipo/faro-prototipo.html).',
  experiment: {
    faroId: NEXUS_ID,
    name: 'Nexus | Nova Home do App',
    bu: 'ecossistema',
    ownerSquad: 'Nexus',
    ownerEmail: 'nexus@example.com',
    status: 'decidido',
    design: {
      context: '',
      hypothesis: { change: 'a nova home do app substituir a antiga', expectedEffect: 'a receita por usuário vai aumentar', because: '' },
      control: { name: 'home antiga', description: 'home antiga' },
      variants: [{ key: 'a', name: 'home nova', description: 'home nova' }],
      primaryMetricId: 'receita_por_usuario',
      secondaryMetricIds: ['conversao_carrinho', 'ticket_medio', 'conversao_repet_nova'],
      guardrailMetricIds: ['conversao', 'margem_2_por_usuario'],
      mdeRelative: 0.05,
    },
    audience: { description: 'Todos os clientes', source: 'manual', estimatedShare: 1 },
    allocation: { platforms: ['android', 'ios'], pages: ['home'], trafficPercent: 100, split: [0.02, 0.98], startDate: '2026-08-12', endDate: '2026-11-30' },
    dy: {
      campaignName: 'Nexus | Nova Home do App',
      campaignId: 'dy-nexus-home-app',
      campaignType: 'api_custom',
      labels: [`faro:${NEXUS_ID}`],
      configuredAt: '2026-08-12T09:00:00-03:00',
      configuredBy: 'importacao-legado',
    },
    legacy: true,
    createdAt: '2026-10-14T09:40:00-03:00',
    updatedAt: '2026-10-14T09:40:00-03:00',
  } satisfies Experiment,
  /** Como a campanha aparece no export do DY (entrada da importação de legado e da checagem D+1). */
  dyExport: {
    campaignId: 'dy-nexus-home-app',
    campaignName: 'Nexus | Nova Home do App',
    labels: [] as string[],
    refdate: '2026-10-13',
    variations: [
      { name: 'home antiga', users: NEXUS_FIXED.all.users[0] },
      { name: 'home nova', users: NEXUS_FIXED.all.users[1] },
    ],
    observedSplit: [round(NEXUS_FIXED.all.users[0] / totalAll, 4), round(NEXUS_FIXED.all.users[1] / totalAll, 4)],
    platforms: ['android', 'ios'],
    firstSeen: '2026-08-12',
  },
  health: {
    contaminatedUsers: 26016,
    contaminatedShare: 0.023,
    unstableSplitDays: 6,
    unstableSplitWindowDays: 90,
    readWindow: { from: '2026-08-31', to: '2026-10-12' },
    dailyExposures: NEXUS_DAILY.map(([date, controle, a]) => ({ date, controle, a })),
    dailyExposuresNote: 'Valores aproximados, lidos do gráfico do visualizador.',
  },
  results: nexusResults,
};

// ---------------------------------------------------------------- templates (mock da frente 5)
const templates: Template[] = [
  {
    id: 'tpl-banner-home',
    name: 'Banner de home',
    description: 'Troca de banner ou bloco de destaque na home. Mede cliques e conversão.',
    design: {
      primaryMetricId: 'cliques_recomendacao',
      secondaryMetricIds: ['conversao', 'receita_por_usuario'],
      guardrailMetricIds: ['tempo_carregamento'],
      mdeRelative: 0.1,
      control: { name: 'Controle', description: 'Banner atual da home' },
      variants: [{ key: 'a', name: 'Variante A', description: '' }],
    },
    allocation: { pages: ['home'], platforms: ['site', 'android', 'ios'], trafficPercent: 50, split: [0.5, 0.5] },
  },
  {
    id: 'tpl-teste-preco',
    name: 'Teste de preço',
    description: 'Variação de preço ou desconto exibido. Decide por receita por usuário e protege a margem.',
    design: {
      primaryMetricId: 'receita_por_usuario',
      secondaryMetricIds: ['conversao', 'ticket_medio'],
      guardrailMetricIds: ['margem_2_por_usuario'],
      mdeRelative: 0.05,
      control: { name: 'Controle', description: 'Preço atual' },
      variants: [{ key: 'a', name: 'Variante A', description: '' }],
    },
    allocation: { pages: ['pdp', 'carrinho'], platforms: ['site', 'android', 'ios'], trafficPercent: 50, split: [0.5, 0.5] },
  },
];

write('pages.json', pages);
write('audiences.json', audiences);
write('metrics-catalog.json', metrics);
write('nexus.json', nexus);
write('simulated.json', {
  source: 'Testes simulados do protótipo (docs/prototipo/faro-prototipo.html), resultados gerados pelo gerador seedado do protótipo.',
  experiments: SIMULATED.map(toExperiment),
  results: SIMULATED.flatMap(simulatedResults),
});
write('templates.json', templates);
console.log('fixtures geradas em', OUT);
