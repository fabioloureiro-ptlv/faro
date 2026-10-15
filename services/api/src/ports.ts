// Portas para módulos de outras frentes. Implementações reais substituem os mocks em mocks/.
import type {
  Audience,
  AudienceShortcut,
  Allocation,
  Experiment,
  MetricDefinition,
  OverlapDecision,
  PageCatalog,
  Platform,
  Template,
} from '@faro/contracts';
import type { DyCampaignSnapshot } from '@faro/config-core';

/** Frente 4. */
export interface MetricCatalogPort {
  list(): Promise<MetricDefinition[]>;
  get(id: string): Promise<MetricDefinition | undefined>;
  createDraft(input: DraftMetricInput, requestedBy: string): Promise<MetricDefinition>;
}

export interface DraftMetricInput {
  name: string;
  kind: 'proportion' | 'mean';
  definition: string;
  /** Área do catálogo onde a métrica entra (ajuste de produto 14/10: escolhida antes de criar). */
  section?: MetricDefinition['section'];
  /** Proporção: taxa 0–1. Média: valor médio atual. */
  baseline: number;
  /** Só para média: desvio padrão atual. */
  stdDev?: number;
}

/** Frente 3. */
export interface AudiencePort {
  pageCatalog(): Promise<PageCatalog>;
  shortcuts(): Promise<AudienceShortcut[]>;
  estimateEligibleDaily(allocation: Allocation, audience: Audience): Promise<number>;
  /** Garante um atributo DY publicado para o público. Retorna o nome do atributo. */
  ensureDyAttribute(faroId: string, audience: Audience): Promise<string | undefined>;
}

/** Frente 3. */
export interface OverlapPort {
  listOverlaps(exp: Experiment, others: Experiment[]): Promise<OverlapDecision[]>;
}

/** Frente 5. */
export interface TemplatePort {
  list(): Promise<Template[]>;
  get(id: string): Promise<Template | undefined>;
}

/** Export do DY (dados: frente 4). */
export interface DyExportPort {
  getCampaign(campaignId: string): Promise<DyCampaignInfo | undefined>;
  getSnapshot(campaignId: string, refdate: string): Promise<DyCampaignSnapshot | undefined>;
  /** Campanhas disponíveis para importação, mais recentes primeiro. */
  listCampaigns(): Promise<DyCampaignInfo[]>;
}

export interface DyCampaignInfo {
  campaignId: string;
  campaignName: string;
  labels: string[];
  variations: string[];
  platforms: Platform[];
  pages: string[];
  firstSeen: string;
  observedSplit: number[];
}

export interface Ports {
  metrics: MetricCatalogPort;
  audience: AudiencePort;
  overlap: OverlapPort;
  templates: TemplatePort;
  dyExport: DyExportPort;
  now: () => Date;
}
