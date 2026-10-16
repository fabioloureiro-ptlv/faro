// E8 — adapter: snapshot das consultas do roadmap (dy_results v3, dy_discovery, dy_daily v3) →
// Experiment[] descobertos e ResultsResponse por faroId × platform × grain. O motor estatístico não
// recalcula nada que o SQL já traz; o Faro só rotula (`significanceLabel`), fecha o qui-quadrado do SRM,
// conta dias de split instável, sintetiza e deriva funil e saúde.
import type {
  Bu,
  Experiment,
  ExperimentStatus,
  Funnel,
  Grain,
  MetricBayes,
  MetricDefinition,
  MetricResult,
  MetricRole,
  Platform,
  ReadWindowOrigin,
  ResultsResponse,
  SynthesisPart,
  TestHealthPoint,
  VariantSummary,
  VolumesRow,
} from '@faro/contracts';
import { ExperimentSchema, ROADMAP_METRICS, ROADMAP_METRIC_TO_FARO, ROADMAP_SOURCE_TABLES, ROADMAP_SQL_REF, resultsResponseSchema } from '@faro/contracts';
import { recommend, significanceLabel, srm, synthesize } from '@faro/stats';
import { translateRecommendation } from './recommend.ts';
import type { DailyRow, DiscoveryRow, ResultsRow, RoadmapSnapshot } from './types.ts';

/**
 * Prefixo dos testes descobertos no DY sem cadastro no Faro (convenção do painel, PNL-07):
 * `FARO-0000-NNNN`, numerados pela ordem alfabética da campanha. // DECISAO-PENDENTE: o número muda
 * se a lista de campanhas mudar entre snapshots; um id estável (hash) exigiria afrouxar FaroIdSchema.
 */
export const DISCOVERED_PREFIX = 'FARO-0000-';

const GRAIN_SQL: Record<Grain, 'usuario' | 'sessao'> = { user: 'usuario', session: 'sessao' };
const DEVICE: Record<Exclude<Platform, 'site'> | 'all', string> = { all: 'Total', android: 'Android', ios: 'iOS' };
/** Métricas principais com série diária acumulável a partir do dy_daily (somas sobre usuarios_leitura). */
const CUMULATIVE: Record<string, (c: { receita: number; compradores: number; transacoes: number; usuarios: number }) => number | null> = {
  receita_por_usuario: (c) => (c.usuarios ? c.receita / c.usuarios : null),
  conversao: (c) => (c.usuarios ? c.compradores / c.usuarios : null),
  transacoes_por_usuario: (c) => (c.usuarios ? c.transacoes / c.usuarios : null),
  ticket_medio: (c) => (c.transacoes ? c.receita / c.transacoes : null),
};

/* ---------------------------------------------------------------- utilidades */

export const slugKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'variante';

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const n0 = (v: unknown): number => n(v) ?? 0;
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const col = (row: ResultsRow, prefix: string, m: string) => (row as Record<string, unknown>)[`${prefix}${m}`];
const streamsOf = (rows: { stream: 'web' | 'app' }[]) => [...new Set(rows.map((r) => r.stream))];
const toBool = (v: unknown): boolean | undefined =>
  typeof v === 'boolean' ? v : v === 1 || v === '1' || v === 'true' ? true : v === 0 || v === '0' || v === 'false' ? false : undefined;
const norm = (s: string) => s.trim().toLowerCase();

/** `origem_datas` do SQL: 'roadmap', 'detectado' ou 'sem periodo estavel (periodo inteiro)'. */
export function readWindowOrigin(raw: unknown): ReadWindowOrigin | undefined {
  const t = text(raw).toLowerCase();
  if (!t) return undefined;
  if (t.startsWith('roadmap')) return 'roadmap';
  if (t.startsWith('detectado')) return 'detectado';
  return 'periodo_inteiro';
}

function pickStream(streams: ('web' | 'app')[], exp: Experiment | undefined, rowsOf: (s: 'web' | 'app') => ResultsRow[]): 'web' | 'app' | undefined {
  if (!streams.length) return undefined;
  if (streams.length === 1) return streams[0];
  const wantsApp = exp?.allocation.platforms.some((p) => p !== 'site');
  const wantsSite = exp?.allocation.platforms.includes('site');
  if (wantsApp && !wantsSite && streams.includes('app')) return 'app';
  if (wantsSite && !wantsApp && streams.includes('web')) return 'web';
  // Dois streams e cadastro ambíguo: o de maior volume. // DECISAO-PENDENTE: consolidar web+app exigiria o SQL somar.
  return streams
    .map((s) => [s, rowsOf(s).reduce((a, r) => a + n0(r.unidades), 0)] as const)
    .sort((a, b) => b[1] - a[1])[0]![0];
}

/* ---------------------------------------------------------------- experimentos descobertos */

const STATUS_BY_ESTADO = (estado: string | undefined): ExperimentStatus =>
  estado === undefined ? 'rodando' : /^rodando/i.test(estado) ? 'rodando' : /^decidido/i.test(estado) ? 'decidido' : 'configurado_no_dy';
const BU_BY_COL = (bu: string): Bu => {
  const b = bu.toLowerCase();
  if (b === 'cross' || b === 'ecossistema') return 'ecossistema';
  if (b.startsWith('servic')) return 'servicos';
  if (b === 'ecom' || b === 'saude' || b === 'fintech') return b;
  return 'ecossistema';
};
const variantesOf = (v: DiscoveryRow['variantes']): string[] =>
  (Array.isArray(v) ? v : (v ?? '').split(/[;|,]/)).map((x) => x.trim()).filter(Boolean);
const suggestedDate = (row: DiscoveryRow, which: 'inicio' | 'fim'): string | undefined => {
  const r = row as Record<string, unknown>;
  for (const k of Object.keys(r)) if (k.includes(which) && typeof r[k] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r[k] as string)) return r[k] as string;
  return undefined;
};

export interface DiscoverOptions {
  /** Dono dos testes sem cadastro (padrão: time de experimentação). */
  ownerEmail?: string;
}

/**
 * Campanhas do snapshot (discovery ∪ resultados) sem cadastro no Faro viram experimentos legados
 * `FARO-0000-NNNN`, na ordem alfabética da campanha. O vínculo com o cadastro é pelo nome da
 * campanha no DY (ou pelo nome do experimento), sem distinguir caixa.
 */
export function discoverExperiments(snap: RoadmapSnapshot, registered: Experiment[], opts: DiscoverOptions = {}): Experiment[] {
  const known = new Set(registered.flatMap((e) => [e.dy?.campaignName, e.name]).filter((x): x is string => !!x).map(norm));
  const names = new Set<string>();
  for (const d of snap.discovery) names.add(d.campanha);
  for (const r of snap.results) if (r.grao === 'usuario' && r.device === 'Total') names.add(r.campanha);
  const out: Experiment[] = [];
  let seq = 0;
  for (const campanha of [...names].filter((c) => !known.has(norm(c))).sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
    const d = snap.discovery.find((x) => x.campanha === campanha);
    const rows = snap.results.filter((r) => r.campanha === campanha);
    const totals = rows.filter((r) => r.grao === 'usuario' && r.device === 'Total');
    const control = totals.find((r) => r.is_controle) ?? rows.find((r) => r.is_controle);
    const fromRows = [...new Set((totals.length ? totals : rows).map((r) => r.variacao))];
    const fromDiscovery = d ? variantesOf(d.variantes) : [];
    const allNames = fromDiscovery.length ? fromDiscovery : fromRows;
    const controlName = control?.variacao ?? allNames[0] ?? 'controle';
    const others = allNames.filter((x) => x !== controlName);
    if (!others.length && !d) continue; // só controle nos resultados: não é teste A/B legível
    const stream = d?.stream ?? rows[0]?.stream ?? 'web';
    const platforms: Platform[] = stream === 'app' ? ['android', 'ios'] : ['site'];
    const starts = rows.map((r) => r.data_inicio_leitura ?? '').filter(Boolean).sort();
    const ends = rows.map((r) => r.data_fim_leitura ?? '').filter(Boolean).sort();
    const start = (d && suggestedDate(d, 'inicio')) ?? starts[0] ?? snap.meta.dadosAte;
    const end = (d && suggestedDate(d, 'fim')) ?? ends[ends.length - 1] ?? snap.meta.dadosAte;
    const norteSql = text(control?.metrica_norte ?? rows[0]?.metrica_norte);
    const buRaw = text(d?.bu) || text(rows[0]?.bu);
    const names = [controlName, ...(others.length ? others : ['variante'])];
    seq += 1;
    const exp: Experiment = {
      faroId: `${DISCOVERED_PREFIX}${String(seq).padStart(4, '0')}`,
      name: campanha,
      bu: BU_BY_COL(buRaw),
      ownerSquad: 'DY · não cadastrado',
      ownerEmail: opts.ownerEmail ?? 'time-experimentacao@example.com',
      status: STATUS_BY_ESTADO(d ? text(d.estado) : undefined),
      legacy: true,
      design: {
        context: 'Importado do DY pelo roadmap, completar cadastro.',
        hypothesis: { change: 'importado do DY, completar cadastro', expectedEffect: 'importado do DY, completar cadastro', because: 'importado do DY, completar cadastro' },
        control: { name: controlName, description: 'importado do DY, completar cadastro' },
        variants: names.slice(1).map((name) => ({ key: slugKey(name), name, description: 'importado do DY, completar cadastro' })),
        primaryMetricId: ROADMAP_METRIC_TO_FARO[norteSql] ?? 'receita_por_usuario',
        secondaryMetricIds: [],
        guardrailMetricIds: [],
        mdeRelative: 0.05,
      },
      audience: { description: 'Não registrado (teste criado direto no DY)', source: 'manual' },
      // DECISAO-PENDENTE: split planejado desconhecido no DY; 1/n para o SRM ter referência.
      allocation: { platforms, pages: [], trafficPercent: 100, split: names.map(() => 1 / names.length), startDate: start, endDate: end, readWindow: { start, end } },
      dy: { campaignName: campanha, labels: [] },
      createdAt: start,
      updatedAt: snap.meta.dadosAte,
    };
    out.push(ExperimentSchema.parse(exp));
  }
  return out;
}

/* ---------------------------------------------------------------- resultados */

export function campaignRows(snap: RoadmapSnapshot, campanha: string): ResultsRow[] {
  const c = norm(campanha);
  return snap.results.filter((r) => norm(r.campanha) === c);
}

/** Campanha do snapshot vinculada ao experimento (pelo nome no DY ou pelo nome do teste). */
export function campaignOf(snap: RoadmapSnapshot, exp: Experiment): string | undefined {
  for (const name of [exp.dy?.campaignName, exp.name]) {
    if (!name) continue;
    const hit = snap.results.find((r) => norm(r.campanha) === norm(name));
    if (hit) return hit.campanha;
  }
  return undefined;
}

export function platformsAvailable(snap: RoadmapSnapshot, campanha: string, exp?: Experiment): (Platform | 'all')[] {
  const all = campaignRows(snap, campanha);
  const stream = pickStream(streamsOf(all), exp, (s) => all.filter((r) => r.stream === s));
  const out: (Platform | 'all')[] = ['all'];
  if (all.some((r) => r.stream === 'web' && r.device === 'Total')) out.push('site');
  const appStream = stream === 'web' && all.some((r) => r.stream === 'app') ? 'app' : stream;
  const app = all.filter((r) => r.stream === appStream);
  if (app.some((r) => r.device === 'Android')) out.push('android');
  if (app.some((r) => r.device === 'iOS')) out.push('ios');
  return out;
}

function selectRows(snap: RoadmapSnapshot, campanha: string, exp: Experiment | undefined, grain: Grain, platform: Platform | 'all') {
  const all = campaignRows(snap, campanha).filter((r) => r.grao === GRAIN_SQL[grain]);
  if (platform === 'site') return { stream: 'web' as const, rows: all.filter((r) => r.stream === 'web' && r.device === 'Total') };
  if (platform === 'android' || platform === 'ios')
    return { stream: 'app' as const, rows: all.filter((r) => r.stream === 'app' && r.device === DEVICE[platform]) };
  const stream = pickStream(streamsOf(all), exp, (s) => all.filter((r) => r.stream === s));
  return { stream, rows: stream ? all.filter((r) => r.stream === stream && r.device === 'Total') : [] };
}

function plannedShares(exp: Experiment | undefined, variants: { name: string; isControl: boolean }[]): number[] {
  const k = variants.length;
  if (!exp) return variants.map(() => 1 / k);
  const names = [exp.design.control.name, ...exp.design.variants.map((v) => v.name)].map(norm);
  const split = exp.allocation.split;
  if (split.length !== names.length) return variants.map(() => 1 / k);
  const shares = variants.map((v) => {
    const i = names.indexOf(norm(v.name));
    return i >= 0 ? split[i]! : NaN;
  });
  return shares.every((s) => Number.isFinite(s)) ? shares : variants.map(() => 1 / k);
}

const roleOf = (v: unknown): MetricRole | undefined => {
  const t = text(v).toLowerCase();
  if (!t) return undefined;
  if (t.startsWith('norte')) return 'norte';
  if (t.startsWith('guard')) return 'guarda';
  return 'exploratoria'; // secundária, exploratória e demais papéis do SQL
};
const bayesOf = (row: ResultsRow, m: string): MetricBayes | undefined => {
  const up = n(col(row, 'uplift_esperado_', m));
  const pb = n(col(row, 'chance_melhor_', m));
  const ls = n(col(row, 'perda_ligar_', m));
  const lk = n(col(row, 'perda_manter_', m));
  const rec = text(col(row, 'recomendacao_', m));
  if (up == null && pb == null && ls == null && lk == null && !rec) return undefined;
  return { expectedUplift: up ?? 0, probBetter: Math.min(1, Math.max(0, pb ?? 0)), lossSwitch: ls ?? 0, lossKeep: lk ?? 0, recommendation: rec };
};

export interface BuildOptions {
  grain?: Grain;
  platform?: Platform | 'all';
}

/** ResultsResponse de um experimento a partir do snapshot. `undefined` quando a campanha não está nele. */
export function buildResults(snap: RoadmapSnapshot, exp: Experiment, catalog: MetricDefinition[], opts: BuildOptions = {}): ResultsResponse | undefined {
  const campanha = campaignOf(snap, exp);
  if (!campanha) return undefined;
  const allRows = campaignRows(snap, campanha);
  if (!allRows.length) return undefined;
  const grain = opts.grain ?? 'user';
  const platform = opts.platform ?? 'all';
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const platforms = platformsAvailable(snap, campanha, exp);
  const availableGrains = (['user', 'session'] as Grain[]).filter((g) => allRows.some((r) => r.grao === GRAIN_SQL[g]));
  const asOf = snap.meta.dadosAte;
  const notes: string[] = [];
  const cut = selectRows(snap, campanha, exp, grain, platform);
  // Recorte sem linhas (ex.: site numa campanha de app): variantes e SRM vêm do consolidado; números ficam vazios.
  const emptyCut = cut.rows.length === 0;
  const { stream, rows } = emptyCut ? selectRows(snap, campanha, exp, availableGrains.includes(grain) ? grain : (availableGrains[0] ?? grain), 'all') : cut;
  const head = rows[0];
  if (!head) return undefined;
  if (emptyCut) notes.push(`Plataforma ${platform} não disponível para este experimento.`);
  const origin = readWindowOrigin(head.origem_datas);
  const readWindow = {
    start: head.data_inicio_leitura ?? exp.allocation.readWindow?.start ?? exp.allocation.startDate,
    end: head.data_fim_leitura ?? exp.allocation.readWindow?.end ?? asOf,
    ...(origin ? { origin } : {}),
  };
  const norteSql = text(head.metrica_norte);
  const norteId = ROADMAP_METRIC_TO_FARO[norteSql] ?? exp.design.primaryMetricId;
  const norteName = byId.get(norteId)?.name ?? norteId;
  const guardrailsWorse = text(head.guardas_piora)
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => ROADMAP_METRIC_TO_FARO[x] ?? x);

  // variantes: controle primeiro
  const ordered = [...rows].sort((a, b) => Number(!!b.is_controle) - Number(!!a.is_controle));
  const variants: VariantSummary[] = ordered.map((r) => ({
    key: slugKey(r.variacao),
    name: r.variacao,
    isControl: !!r.is_controle,
    plannedShare: 0,
    ...(n(r.share_unidades) != null ? { observedShare: Math.min(1, Math.max(0, n(r.share_unidades)!)) } : {}),
  }));
  plannedShares(exp, variants).forEach((s, i) => (variants[i]!.plannedShare = s));
  const control = ordered.find((r) => r.is_controle) ?? head;

  const volumes: VolumesRow[] = emptyCut
    ? []
    : ordered.map((r) => ({ platform, variantKey: slugKey(r.variacao), users: n0(r.unidades), buyers: n0(r.compradores), transactions: n0(r.transacoes), revenue: n0(r.receita) }));

  // métricas: controle = valor; variante = valor + estatísticas prontas do SQL; rótulo pela regra do Faro
  const results: MetricResult[] = [];
  const rolesSeen = new Set<string>();
  for (const m of emptyCut ? [] : ROADMAP_METRICS) {
    const metricId = ROADMAP_METRIC_TO_FARO[m]!;
    if (!ordered.some((r) => n(col(r, '', m)) != null)) continue;
    for (const r of ordered) {
      const value = n(col(r, '', m));
      const base: MetricResult = { faroId: exp.faroId, metricId, platform, grain, variantKey: slugKey(r.variacao), value, n: Math.round(n0(r.unidades)), asOf };
      if (r === control) {
        results.push(base);
        continue;
      }
      const probBetter = n(col(r, 'p_vence_', m));
      const lo = n(col(r, 'ic_lo_', m));
      const hi = n(col(r, 'ic_hi_', m));
      const role = roleOf(col(r, 'papel_', m));
      const rawRole = text(col(r, 'papel_', m)).toLowerCase();
      if (rawRole && role === 'exploratoria' && !rawRole.startsWith('explorat')) rolesSeen.add(rawRole);
      const delta = n(col(r, 'uplift_', m));
      const mde = n(col(r, 'mde_', m));
      const confirmed = toBool(col(r, 'confirmado_', m));
      const cuped = toBool(col(r, 'cuped_', m));
      const minEvents = n(col(r, 'eventos_min_', m));
      const bayes = bayesOf(r, m);
      results.push({
        ...base,
        ...(delta != null ? { deltaRelative: delta } : {}),
        ...(probBetter != null ? { probBetter: Math.min(1, Math.max(0, probBetter)), label: significanceLabel(probBetter) } : {}),
        ...(lo != null && hi != null ? { ci95: { lower: lo, upper: hi } } : {}),
        ...(mde != null ? { mde } : {}),
        ...(role ? { role } : {}),
        ...(confirmed !== undefined ? { confirmed } : {}),
        ...(cuped !== undefined ? { cuped } : {}),
        ...(minEvents != null ? { minEvents } : {}),
        ...(bayes ? { bayes } : {}),
      });
    }
  }
  if (rolesSeen.size) notes.push(`Papéis do SQL mapeados para "exploratoria": ${[...rolesSeen].join(', ')}.`);

  // SRM: qui-quadrado do Faro sobre as unidades; p-valor e alerta do SQL prevalecem.
  const planned = variants.map((v) => v.plannedShare);
  const srmBase = srm(ordered.map((r) => n0(r.unidades)), planned);
  const pSrm = n(control.p_srm);
  const daily = snap.daily.filter(
    (d) => norm(d.campanha) === norm(campanha) && d.stream === (stream ?? d.stream) && d.device === (platform === 'all' || platform === 'site' ? 'Total' : DEVICE[platform]),
  );
  const unstable = new Set(daily.filter((d) => n0(d.usuarios_novos) > 0 && (d.dia < readWindow.start || d.dia > readWindow.end)).map((d) => d.dia)).size;
  const srmResult = { ...srmBase, ...(pSrm != null ? { pValue: Math.min(1, Math.max(0, pSrm)), alert: pSrm < 0.001 } : {}), unstableSplitDays: unstable };

  const exposed = ordered.reduce((a, r) => a + n0(r.unidades), 0);
  const twoVariants = n0(control.usuarios_2_variantes);
  const contamination = { users: Math.round(twoVariants), share: exposed + twoVariants > 0 ? twoVariants / (exposed + twoVariants) : 0 };

  // MDE: linha da variante no grão usuário (ou no grão corrente se usuário não existir)
  const mdeRows = selectRows(snap, campanha, exp, availableGrains.includes('user') ? 'user' : grain, platform).rows.filter((r) => !r.is_controle);
  const mde = ROADMAP_METRICS.filter((m) => mdeRows.some((r) => n(col(r, 'mde_', m)) != null)).map((m) => {
    const metricId = ROADMAP_METRIC_TO_FARO[m]!;
    const cur = mdeRows.map((r) => n(col(r, 'mde_', m))).filter((x): x is number => x != null);
    return { metricId, mdeCurrent: cur.length ? Math.max(...cur) : null, ...(metricId === norteId ? { mdeDesign: exp.design.mdeRelative } : {}) };
  });

  // recomendação: texto do SQL para a NORTE da primeira variante; senão, regras do Faro
  const firstVariant = ordered.find((r) => r !== control);
  const norteRow = firstVariant ? results.find((x) => x.metricId === norteId && x.variantKey === slugKey(firstVariant.variacao)) : undefined;
  const recommendation =
    translateRecommendation(firstVariant ? text(col(firstVariant, 'recomendacao_', norteSql || '')) : undefined, norteName) ??
    recommend({
      status: exp.status,
      hasData: exposed > 0,
      srmPValue: srmResult.pValue,
      variants: variants.map((v) => ({ key: v.key, name: v.name, isControl: v.isControl, ...(v.observedShare != null ? { observedShare: v.observedShare } : {}) })),
      primary: { name: norteName, ...(norteRow?.probBetter != null ? { probBetter: norteRow.probBetter } : {}), ...(norteRow?.label ? { label: norteRow.label } : {}) },
      guardrails: exp.design.guardrailMetricIds.map((id) => {
        const r = firstVariant ? results.find((x) => x.metricId === id && x.variantKey === slugKey(firstVariant.variacao)) : undefined;
        return { metricId: id, name: byId.get(id)?.name ?? id, ...(r?.probBetter != null ? { probBetter: r.probBetter } : {}) };
      }),
      ...(exp.decision ? { decisionText: exp.decision.rationale } : {}),
    });

  // síntese: NORTE e métricas relevantes da primeira variante
  let synthesis: ResultsResponse['synthesis'];
  if (firstVariant) {
    const key = slugKey(firstVariant.variacao);
    const parts: SynthesisPart[] = results
      .filter((x) => x.variantKey === key && x.deltaRelative != null && x.probBetter != null && x.label)
      .map((x) => ({
        metricId: x.metricId,
        name: byId.get(x.metricId)?.name ?? x.metricId,
        role: x.metricId === norteId ? 'norte' : exp.design.guardrailMetricIds.includes(x.metricId) ? 'guarda' : exp.design.secondaryMetricIds.includes(x.metricId) ? 'secundaria' : 'outra',
        deltaRelative: x.deltaRelative!,
        probBetter: x.probBetter!,
        label: x.label!,
      }));
    if (parts.length) synthesis = synthesize({ variantKey: key, variantName: firstVariant.variacao, platform, metrics: parts });
  }

  // funil derivado das taxas: expostos → carrinho → compra → clube
  const funnel = emptyCut ? undefined : buildFunnel(ordered, platform);
  if (funnel) notes.push('Funil derivado das taxas (conversão para o carrinho e no clube × expostos); compradores vêm dos volumes.');

  const health = emptyCut ? [] : buildHealth(daily, norteId, platform);
  const status = text(head.status);
  const guardasPiora = text(head.guardas_piora);

  const payload: ResultsResponse = {
    faroId: exp.faroId,
    asOf,
    fetchedAt: snap.meta.fetchedAt,
    readWindow,
    source: 'roadmap',
    ...(status ? { status } : {}),
    ...(guardrailsWorse.length ? { guardrailsWorse } : {}),
    grain,
    availableGrains,
    platforms,
    variants,
    contamination,
    volumes,
    results,
    srm: srmResult,
    mde,
    health,
    ...(funnel ? { funnel } : {}),
    recommendation,
    ...(synthesis ? { synthesis } : {}),
    lineage: [{ metricId: '*', sourceTable: ROADMAP_SOURCE_TABLES, sqlRef: ROADMAP_SQL_REF, sqlVersion: snap.meta.sqlVersion }],
    notes: [
      ...(status ? [`Status da leitura no roadmap: ${status}.`] : []),
      ...(guardasPiora ? [`Guardrails que pioraram segundo o SQL: ${guardasPiora}.`] : []),
      'Receita faturada e margem chegam com atraso (faturado em D+5): os últimos dias da leitura ficam subestimados nessas métricas.',
      'Recortes Desktop e Mobile existem na consulta e não são exibidos (o contrato de plataforma não tem sub-device web).',
      ...(snap.daily.length ? [] : ['Snapshot sem a consulta diária (dy_daily): saúde do teste e dias de split instável indisponíveis.']),
      ...notes,
    ],
  };
  return resultsResponseSchema.parse(payload);
}

function buildFunnel(ordered: ResultsRow[], platform: Platform | 'all'): Funnel | undefined {
  const hasCart = ordered.some((r) => n(col(r, '', 'conversao_carrinho')) != null);
  const hasClub = ordered.some((r) => n(col(r, '', 'conversao_clube')) != null);
  if (!ordered.some((r) => n0(r.unidades) > 0)) return undefined;
  const steps: Funnel['steps'] = [{ stepId: 'expostos', name: 'Expostos', order: 0 }];
  if (hasCart) steps.push({ stepId: 'carrinho', name: 'Adicionou ao carrinho', order: steps.length, metricId: 'conversao_carrinho' });
  steps.push({ stepId: 'compra', name: 'Comprou', order: steps.length, metricId: 'conversao' });
  if (hasClub) steps.push({ stepId: 'clube', name: 'Assinou o Clube', order: steps.length, metricId: 'conversao_clube' });
  const rows: Funnel['rows'] = [];
  for (const r of ordered) {
    const key = slugKey(r.variacao);
    const u = n0(r.unidades);
    rows.push({ platform, variantKey: key, stepId: 'expostos', users: u });
    if (hasCart) rows.push({ platform, variantKey: key, stepId: 'carrinho', users: Math.round(u * n0(col(r, '', 'conversao_carrinho'))) });
    rows.push({ platform, variantKey: key, stepId: 'compra', users: n0(r.compradores) });
    if (hasClub) rows.push({ platform, variantKey: key, stepId: 'clube', users: Math.round(u * n0(col(r, '', 'conversao_clube'))) });
  }
  return { steps, rows };
}

function buildHealth(daily: DailyRow[], norteId: string, platform: Platform | 'all'): TestHealthPoint[] {
  const cum = CUMULATIVE[norteId];
  const byVariant = new Map<string, DailyRow[]>();
  for (const d of daily) byVariant.set(d.variacao, [...(byVariant.get(d.variacao) ?? []), d]);
  const out: TestHealthPoint[] = [];
  for (const [variacao, list] of byVariant) {
    const acc = { receita: 0, compradores: 0, transacoes: 0, usuarios: 0 };
    for (const d of [...list].sort((a, b) => a.dia.localeCompare(b.dia))) {
      acc.receita += n0(d.receita);
      acc.compradores += n0(d.compradores);
      acc.transacoes += n0(d.transacoes);
      acc.usuarios += n0(d.usuarios_leitura);
      out.push({ date: d.dia, platform, variantKey: slugKey(variacao), exposedUsers: n0(d.usuarios_novos), primaryValue: cum ? cum(acc) : null });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.variantKey.localeCompare(b.variantKey));
}
