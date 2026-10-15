import type {
  Bu,
  Experiment,
  ExperimentStatus,
  GovernanceAlert,
  MetricDefinition,
  MetricResult,
  PageDefinition,
  Platform,
} from '@faro/contracts';

/** Uma linha da lista (PNL-01): experimento + o que outras frentes calculam sobre ele. */
export interface PainelRow {
  experiment: Experiment;
  /** Leitura atual da NORTE na melhor variante (frente 4). */
  norte?: MetricResult;
  alerts: GovernanceAlert[];
}

export interface PainelData {
  experiments: Experiment[];
  norteResults: MetricResult[];
  alerts: GovernanceAlert[];
  pages: PageDefinition[];
  metrics: Pick<MetricDefinition, 'id' | 'name' | 'direction'>[];
  asOf: string;
}

export const SORT_KEYS = [
  'nome',
  'status',
  'onde',
  'publico',
  'norte',
  'periodo',
  'sobreposicao',
  'alertas',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = 'asc' | 'desc';

export interface PainelFilters {
  /** `todas` = visão Ecossistema (todos os testes). */
  bu: Bu | 'todas';
  status: ExperimentStatus[];
  squad: string[];
  platform: Platform[];
  page: string[];
  /** Período: mostra testes cuja janela cruza [from, to]. */
  from?: string;
  to?: string;
  hasAlert: boolean;
  legacy: boolean;
  q: string;
  sort: SortKey;
  dir: SortDir;
}

export const DEFAULT_FILTERS: Readonly<PainelFilters> = Object.freeze({
  bu: 'todas',
  status: [],
  squad: [],
  platform: [],
  page: [],
  hasAlert: false,
  legacy: false,
  q: '',
  sort: 'status',
  dir: 'asc',
});
