// Frente 4 — números-chave ("big numbers") da tela de resultados, portados do protótipo
// (docs/demo/faro-demo.html, stat tiles). Função pura sobre o ResultsResponse: o componente só renderiza.
//
// Quatro tiles, na ordem do protótipo:
//   1. Métrica principal (hero): delta relativo da variante vs. controle, rótulo de significância, IC95 e chance de ser melhor.
//   2. Expostos: total no grão, por variante, e contaminação (quem viu 2 variantes fica fora).
//   3. Amostra (quando a API calcula progresso) ou Período (dias lidos na janela).
//   4. Split: observado vs. planejado, com status do SRM.
import type { MetricDefinition, ResultsResponse, SignificanceLabel } from '@faro/contracts';

export type StatusTone = 'good' | 'warn' | 'critical' | 'none';

/** Status com cor reservada: sempre com ícone + texto, nunca só a cor. */
export interface StatusBadge {
  tone: StatusTone;
  icon: string;
  text: string;
}

/** Trecho de uma linha de detalhe; `strong` destaca nomes de variante e contagens. */
export interface Segment {
  text: string;
  strong?: boolean;
}

export type BigNumberId = 'norte' | 'expostos' | 'amostra' | 'periodo' | 'split';

export interface BigNumber {
  id: BigNumberId;
  /** Rótulo em caixa alta no tile (ex.: "Métrica principal · Receita por usuário"). */
  label: string;
  value: string;
  /** Cor do valor: só o hero usa (delta bom ou ruim, já considerando a direção da métrica). */
  valueTone?: 'good' | 'bad';
  badge?: StatusBadge;
  /** Linhas de detalhe abaixo do valor. */
  detail: Segment[][];
  /** 0–1: barra de progresso (tile de amostra). */
  progress?: number;
  hero?: boolean;
}

export type NorteDefinition = Pick<MetricDefinition, 'id' | 'name' | 'unit' | 'direction'>;

export interface BigNumbersInput {
  results: ResultsResponse;
  /** Id da métrica principal do design (`experiment.design.primaryMetricId`). */
  primaryMetricId: string;
  /** Definição da métrica principal no catálogo, quando conhecida (nome, unidade e direção). */
  norte?: NorteDefinition;
}

export const SIGNIFICANCE_BADGE: Record<SignificanceLabel, StatusBadge> = {
  melhora_confirmada: { tone: 'good', icon: '▲', text: 'Melhora confirmada' },
  tendencia_de_melhora: { tone: 'good', icon: '▲', text: 'Tendência de melhora' },
  sem_tendencia: { tone: 'none', icon: '—', text: 'Sem tendência' },
  tendencia_de_queda: { tone: 'warn', icon: '▼', text: 'Tendência de queda' },
  queda_confirmada: { tone: 'critical', icon: '▼', text: 'Queda confirmada' },
};

// ---- formatação (pt-BR, mesma do protótipo) ----

const nf = (n: number, min = 0, max = 0) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });

export const formatInt = (n: number): string => nf(Math.round(n));

/** 1.100.094 → "1,1 mi"; 21.379 → "21,4 mil"; 438 → "438". */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${nf(n / 1e6, 0, 1)} mi`;
  if (abs >= 1e3) return `${nf(n / 1e3, 0, 1)} mil`;
  return formatInt(n);
}

export const formatPercent = (x: number, digits = 1): string => `${nf(x * 100, digits, digits)}%`;

/** Delta relativo com sinal tipográfico: +108,1% / −10,7% / 0,0%. */
export function formatSignedPercent(d: number, digits = 1): string {
  const sign = d > 0 ? '+' : d < 0 ? '−' : '';
  return `${sign}${nf(Math.abs(d) * 100, digits, digits)}%`;
}

/** Valor de uma métrica na unidade do catálogo (sem unidade conhecida, número com 2 casas). */
export function formatMetricValue(
  value: number | null | undefined,
  unit?: MetricDefinition['unit'],
): string {
  if (value === null || value === undefined) return '—';
  switch (unit) {
    case 'percent':
      return formatPercent(value, value !== 0 && Math.abs(value) < 0.01 ? 2 : 1);
    case 'brl':
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    case 'seconds':
      return `${nf(value, 0, 2)} s`;
    default:
      return nf(value, 0, 2);
  }
}

export const formatDayMonth = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function formatPValue(p: number): string {
  return p < 0.0001 ? '< 0,0001' : `= ${nf(p, 3, 3)}`;
}

const DAY_MS = 86_400_000;

/** Dias com leitura: datas distintas da série diária; sem série, o tamanho da janela de leitura. */
export function daysRead(r: ResultsResponse): number {
  const dates = new Set(r.health.map((h) => h.date));
  if (dates.size) return dates.size;
  const start = Date.parse(`${r.readWindow.start}T00:00:00Z`);
  const end = Date.parse(`${r.readWindow.end}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / DAY_MS) + 1;
}

/** Sem exposição registrada ainda (agendado): não há número-chave para mostrar. */
export function hasData(r: ResultsResponse): boolean {
  return r.results.length > 0 || r.recommendation.code !== 'aguardando_dados';
}

/** Delta é bom quando sobe numa métrica "maior é melhor" ou desce numa "menor é melhor". */
export function isGoodDelta(
  direction: MetricDefinition['direction'] | undefined,
  delta: number | undefined,
): boolean | undefined {
  if (delta === undefined || delta === 0) return undefined;
  return (direction ?? 'higher_better') === 'lower_better' ? delta < 0 : delta > 0;
}

const seg = (text: string, strong = false): Segment => (strong ? { text, strong } : { text });

export function buildBigNumbers({
  results: r,
  primaryMetricId,
  norte,
}: BigNumbersInput): BigNumber[] {
  const control = r.variants.find((v) => v.isControl);
  const challengers = r.variants.filter((v) => !v.isControl);
  // Variante lida: a da síntese (a melhor segundo a API); senão, a primeira.
  const variant = challengers.find((v) => v.key === r.synthesis?.variantKey) ?? challengers[0];
  const norteRows = r.results.filter((x) => x.metricId === primaryMetricId && x.grain === r.grain);
  const nv = variant ? norteRows.find((x) => x.variantKey === variant.key) : undefined;
  const nc = control ? norteRows.find((x) => x.variantKey === control.key) : undefined;
  const unit = norte?.unit;
  const grainWord = r.grain === 'session' ? 'sessões' : 'usuários';

  const tiles: BigNumber[] = [];

  // 1. Métrica principal (hero)
  const good = isGoodDelta(norte?.direction, nv?.deltaRelative);
  const heroDetail: Segment[] = [];
  const semLeitura =
    (nv?.value === null || nv?.value === undefined) &&
    (nc?.value === null || nc?.value === undefined);
  if (semLeitura)
    heroDetail.push(
      seg('Sem leitura ainda: os números aparecem no dia seguinte à primeira exposição.'),
    );
  else if (variant && control) {
    heroDetail.push(
      seg(variant.name, true),
      seg(` ${formatMetricValue(nv?.value, unit)} vs `),
      seg(control.name, true),
      seg(` ${formatMetricValue(nc?.value, unit)}`),
    );
  }
  if (nv?.ci95)
    heroDetail.push(
      seg(` · IC95 ${formatSignedPercent(nv.ci95.lower)} a ${formatSignedPercent(nv.ci95.upper)}`),
    );
  if (nv?.probBetter !== undefined)
    heroDetail.push(
      seg(' · chance de ser melhor '),
      seg(`${Math.round(nv.probBetter * 100)}%`, true),
    );
  tiles.push({
    id: 'norte',
    hero: true,
    label: `Métrica principal · ${norte?.name ?? primaryMetricId}`,
    value: nv?.deltaRelative === undefined ? '—' : formatSignedPercent(nv.deltaRelative),
    ...(good === undefined ? {} : { valueTone: good ? 'good' : 'bad' }),
    ...(nv?.label ? { badge: SIGNIFICANCE_BADGE[nv.label] } : {}),
    detail: heroDetail.length ? [heroDetail] : [],
  });

  // 2. Expostos
  const usersByVariant = new Map(r.volumes.map((v) => [v.variantKey, v.users]));
  const totalUsers = r.volumes.reduce((acc, v) => acc + v.users, 0);
  const perVariant: Segment[] = [];
  r.variants.forEach((v, i) => {
    if (i) perVariant.push(seg(' · '));
    perVariant.push(seg(v.name, true), seg(` ${formatCompact(usersByVariant.get(v.key) ?? 0)}`));
  });
  const contamination = r.contamination.users
    ? `${formatInt(r.contamination.users)} viram 2 variantes (${formatPercent(r.contamination.share)}), excluídos`
    : 'sem contaminação registrada';
  tiles.push({
    id: 'expostos',
    label: `Expostos (${grainWord})`,
    value: formatCompact(totalUsers),
    detail: [perVariant, [seg(contamination)]],
  });

  // 3. Amostra ou Período
  if (r.sample) {
    const s = r.sample;
    const complete = s.progress >= 1;
    const detail: Segment[] = [
      seg(formatCompact(s.minPerArm), true),
      seg(` de ${formatCompact(s.requiredPerArm)} por grupo`),
    ];
    if (s.earlySignificanceAlert) detail.push(seg(' · significância precoce, aguardar amostra'));
    tiles.push({
      id: 'amostra',
      label: 'Amostra',
      badge: complete
        ? { tone: 'good', icon: '✓', text: 'completa' }
        : { tone: s.earlySignificanceAlert ? 'warn' : 'none', icon: '…', text: 'em coleta' },
      value: formatPercent(s.progress, 0),
      detail: [detail],
      progress: Math.min(1, Math.max(0, s.progress)),
    });
  } else {
    const days = daysRead(r);
    const detail: Segment[] = [
      seg(`${formatDayMonth(r.readWindow.start)} a ${formatDayMonth(r.readWindow.end)}`),
    ];
    if (r.srm.unstableSplitDays) detail.push(seg(` · ${r.srm.unstableSplitDays} dias excluídos`));
    tiles.push({
      id: 'periodo',
      label: 'Período',
      value: days ? `${days} dias` : '—',
      detail: [detail],
    });
  }

  // 4. Split
  tiles.push({
    id: 'split',
    label: 'Split',
    badge: r.srm.alert
      ? { tone: 'critical', icon: '!', text: 'SRM' }
      : { tone: 'good', icon: '✓', text: 'ok' },
    value: r.srm.observedShares.map((x) => formatPercent(x, 1)).join(' / '),
    detail: [
      [
        seg(
          `planejado ${r.srm.plannedShares.map((x) => formatPercent(x, 0)).join(' / ')} · p ${formatPValue(r.srm.pValue)}`,
        ),
      ],
    ],
  });

  return tiles;
}
