import type {
  Decision,
  Experiment,
  ExperimentAuditEvent,
  ExperimentHealth,
  GovernanceAlert,
  MetricDefinition,
  MetricResult,
  PageDefinition,
  Platform,
} from '@faro/contracts';
import { DESIGN_FIELD_LABEL } from '@faro/api/experiments/governance';
import type { ClosingChecklist } from '@faro/api/experiments/status';
import { BU_LABEL, OVERLAP_LABEL, PLATFORM_LABEL, STATUS_LABEL } from './labels';
import { worstOverlap } from './sort';

export interface RelatedExperiment {
  faroId: string;
  name: string;
  bu: Experiment['bu'];
  status: Experiment['status'];
}

/** Payload de GET /api/experiments/:faroId. */
export interface ExperimentDetail {
  experiment: Experiment;
  /** Todas as leituras da NORTE (consolidado e por plataforma, todos os braços). */
  norteResults: MetricResult[];
  health?: ExperimentHealth;
  events: ExperimentAuditEvent[];
  alerts: GovernanceAlert[];
  metrics: MetricDefinition[];
  pages: PageDefinition[];
  related: RelatedExperiment[];
  /** Checklist de encerramento (PNL-10), quando o teste está decidido. */
  closing?: ClosingChecklist;
  actions: DetailActions;
}

/** O que o ator atual pode fazer neste teste (calculado no servidor). */
export interface DetailActions {
  /** E-mail de quem está agindo; ausente quando não há autenticação. */
  actor?: string;
  canDecide: boolean;
  canClose: boolean;
}

export const CONTROL_KEY = 'controle';

export const OUTCOME_LABEL: Record<Decision['outcome'], string> = {
  implementar_variante: 'Implementar variante',
  manter_controle: 'Manter controle',
  sem_vencedor: 'Sem vencedor',
  invalido: 'Teste inválido',
};

const FIELD_LABEL: Record<string, string> = {
  ...DESIGN_FIELD_LABEL,
  hypothesis: 'hipótese',
  control: 'controle',
  variants: 'variantes',
  primaryMetricId: 'métrica NORTE',
  secondaryMetricIds: 'métricas secundárias',
  guardrailMetricIds: 'métricas GUARDA',
  mdeRelative: 'MDE',
  platforms: 'plataformas',
  pages: 'páginas',
  trafficPercent: 'tráfego',
  split: 'split',
  startDate: 'início',
  endDate: 'fim',
  exclusionGroupId: 'grupo de exclusão mútua',
};

export const fieldLabel = (f: string) => FIELD_LABEL[f] ?? f;

const nf = (n: number) => n.toLocaleString('pt-BR');
const pct = (x: number, digits = 1) =>
  (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%';

export function contaminationShare(s: ExperimentHealth): number {
  const total = Object.values(s.usersByVariant).reduce((a, b) => a + b, 0);
  return total === 0 ? 0 : s.contaminatedUsers / total;
}

export function formatSplit(split: number[]): string {
  return split.map((x) => pct(x, x * 100 === Math.round(x * 100) ? 0 : 1)).join(' × ');
}

export function formatMetricValue(value: number | null, unit: MetricDefinition['unit'] | undefined): string {
  if (value === null) return '—';
  switch (unit) {
    case 'percent':
      return pct(value, value < 0.01 ? 2 : 1);
    case 'brl':
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    case 'seconds':
      return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`;
    default:
      return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  }
}

export type TagTone = 'neutral' | 'ok' | 'warn' | 'risk';
export interface HeaderTag {
  label: string;
  value: string;
  tone: TagTone;
}

/** PNL-05: tags do cabeçalho. */
export function headerTags(
  e: Experiment,
  health: ExperimentHealth | undefined,
  pageName: (id: string) => string,
): HeaderTag[] {
  const a = e.allocation;
  const tags: HeaderTag[] = [
    { label: 'Status', value: STATUS_LABEL[e.status], tone: 'neutral' },
    { label: 'BU', value: BU_LABEL[e.bu], tone: 'neutral' },
    {
      label: 'Variantes',
      value: [e.design.control.name, ...e.design.variants.map((v) => v.name)].join(' × '),
      tone: 'neutral',
    },
    {
      label: 'Onde',
      value: `${a.pages.map(pageName).join(', ')} · ${a.platforms.map((p) => PLATFORM_LABEL[p]).join(', ')}`,
      tone: 'neutral',
    },
    { label: 'Público', value: e.audience.description, tone: 'neutral' },
    {
      label: 'Tráfego',
      value: `${a.trafficPercent}% do público · split ${formatSplit(a.split)}`,
      tone: a.split.some((s) => s >= 0.9) ? 'warn' : 'neutral',
    },
  ];

  if (health) {
    const share = contaminationShare(health);
    tags.push({
      label: 'Contaminação',
      value: `${nf(health.contaminatedUsers)} viram mais de uma variante (${pct(share)}), excluídos`,
      tone: share >= 0.02 ? 'warn' : 'neutral',
    });
  }

  const overlaps = e.overlap ?? [];
  if (overlaps.length) {
    const worst = worstOverlap({ experiment: e, alerts: [] })!;
    const pending = overlaps.filter((o) => !o.resolution).length;
    tags.push({
      label: 'Sobreposições',
      value: `${overlaps.length} · pior ${OVERLAP_LABEL[worst].toLowerCase()}${pending ? ` · ${pending} sem decisão` : ''}`,
      tone: pending && worst === 'alto' ? 'risk' : worst === 'alto' ? 'warn' : 'neutral',
    });
  } else {
    tags.push({ label: 'Sobreposições', value: 'nenhuma', tone: 'neutral' });
  }
  return tags;
}

export interface NorteRow {
  platform: Platform | 'all';
  control?: MetricResult;
  variants: MetricResult[];
}

/** Leituras da NORTE agrupadas por plataforma: consolidado primeiro, depois na ordem da alocação. */
export function norteRows(e: Experiment, results: MetricResult[]): NorteRow[] {
  const mine = results.filter((r) => r.faroId === e.faroId && r.metricId === e.design.primaryMetricId);
  const order: (Platform | 'all')[] = ['all', ...e.allocation.platforms];
  const variantOrder = e.design.variants.map((v) => v.key);
  return order
    .map((platform) => {
      const rs = mine.filter((r) => r.platform === platform);
      return {
        platform,
        control: rs.find((r) => r.variantKey === CONTROL_KEY),
        variants: rs
          .filter((r) => r.variantKey !== CONTROL_KEY)
          .sort((a, b) => variantOrder.indexOf(a.variantKey) - variantOrder.indexOf(b.variantKey)),
      };
    })
    .filter((row) => row.control || row.variants.length);
}

export interface TimelineItem {
  at: string;
  title: string;
  detail?: string;
  actor: string;
  kind: ExperimentAuditEvent['type'];
}

const actorLabel = (a: string) => (a === 'system' ? 'Faro (automático)' : a);

export function describeEvent(ev: ExperimentAuditEvent): TimelineItem {
  const base = { at: ev.at, kind: ev.type };
  switch (ev.type) {
    case 'experiment.created':
      return {
        ...base,
        title: ev.importedFromDy ? 'Importado do DY como legado' : 'Experimento criado',
        actor: actorLabel(ev.actor),
      };
    case 'experiment.status_changed':
      return {
        ...base,
        title: `${STATUS_LABEL[ev.from]} → ${STATUS_LABEL[ev.to]}`,
        ...(ev.reason ? { detail: ev.reason } : {}),
        actor: actorLabel(ev.actor),
      };
    case 'experiment.decided':
      return {
        ...base,
        title: `Decisão: ${OUTCOME_LABEL[ev.decision.outcome]}`,
        detail: ev.decision.rationale,
        actor: actorLabel(ev.decision.decidedBy),
      };
    case 'experiment.design_changed':
      return {
        ...base,
        title: 'Design alterado',
        detail: ev.fields.map(fieldLabel).join(', '),
        actor: actorLabel(ev.actor),
      };
    case 'experiment.allocation_changed':
      return {
        ...base,
        title: 'Alocação alterada',
        detail: ev.fields.map(fieldLabel).join(', '),
        actor: actorLabel(ev.actor),
      };
  }
}

/** PNL-11: mais recente primeiro; no mesmo instante, mantém a ordem de registro. */
export function buildTimeline(events: ExperimentAuditEvent[]): TimelineItem[] {
  return events
    .map((ev, i) => ({ ev, i }))
    .sort((a, b) => b.ev.at.localeCompare(a.ev.at) || b.i - a.i)
    .map(({ ev }) => describeEvent(ev));
}

const DATE_TIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Fuso fixo para o SSR e o navegador renderizarem o mesmo texto. */
export function formatDateTime(iso: string): string {
  if (iso.length <= 10) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return DATE_TIME.format(new Date(iso));
}
