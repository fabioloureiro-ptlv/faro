// Modelo de domínio compartilhado (docs/specs/00-contexto-geral.md, seção 6).
// Mudanças seguem o protocolo da seção 9: registrar em CHANGELOG.md e, se incompatível, ADR.

export type Bu = 'ecom' | 'saude' | 'fintech' | 'servicos' | 'ecossistema';
export type Platform = 'site' | 'android' | 'ios';

export type ExperimentStatus =
  | 'rascunho' // design incompleto
  | 'design_completo' // passou no gate de design
  | 'pronto_para_configurar' // público, alocação e sobreposição resolvidos
  | 'configurado_no_dy' // operador confirmou a campanha no DY
  | 'rodando' // exposições chegando
  | 'decidido' // decisão tomada, campanha ainda ativa no DY
  | 'encerrado' // campanha desligada, decisão registrada
  | 'cancelado';

export interface Experiment {
  faroId: string; // ex.: "FARO-2026-0042" (imutável)
  name: string;
  bu: Bu;
  ownerSquad: string;
  ownerEmail: string;
  status: ExperimentStatus;
  templateId?: string; // frente 5
  design: Design; // frente 1
  audience: Audience; // frente 3
  allocation: Allocation; // frentes 1 e 3
  overlap?: OverlapDecision[]; // frente 3
  dy?: DyLink; // frente 1
  decision?: Decision; // frente 2
  legacy?: boolean; // teste importado do DY sem design original
  createdAt: string;
  updatedAt: string;
}

export interface Design {
  context: string; // problema + evidência
  hypothesis: { change: string; expectedEffect: string; because: string };
  control: { name: string; description: string; figmaUrl?: string };
  /** Cada variante precisa de Figma OU print (imagem) — um dos dois é obrigatório. */
  variants: { key: string; name: string; description: string; figmaUrl?: string; printUrl?: string }[];
  primaryMetricId: string; // exatamente uma (NORTE)
  secondaryMetricIds: string[]; // ≥ 1
  guardrailMetricIds: string[]; // ≥ 0 (GUARDA)
  mdeRelative: number; // ex.: 0.05
  baselineOverride?: number; // ajuste manual da linha de base da NORTE
}

// Dono: frente 3 (03-segmentacao-e-sobreposicao.md, seção 8).
export type AudienceCondition =
  | { type: 'comprou'; dimension: 'categoria' | 'marca' | 'item'; values: string[]; windowDays: number }
  | { type: 'evento'; eventName: string; windowDays: number; minCount?: number }
  | { type: 'propriedade'; key: 'repet' | 'clube' | 'plano_saude' | 'especie_pet' | 'regiao' | (string & {}); op: 'eq' | 'in' | 'neq'; values: string[] }
  | { type: 'plataforma'; values: Platform[] };

export interface AudienceRule {
  op: 'and' | 'or';
  conditions: (AudienceCondition | AudienceRule)[];
}

/** Grupo de exclusão mútua (SEG-13): fatias de tráfego por teste numa página/plataforma. */
export interface ExclusionGroup {
  id: string;
  pages: string[];
  platforms: Platform[];
  slices: { faroId: string; percent: number }[];
}

/** Sobreposição observada (SEG-14): usuários expostos a dois testes no período. */
export interface ObservedOverlap {
  faroIdA: string;
  faroIdB: string;
  usersBoth: number;
  shareOfA: number;
  shareOfB: number;
  asOf: string;
}

export interface Audience {
  description: string; // texto livre, obrigatório
  source: 'atalho' | 'regra' | 'manual';
  rule?: AudienceRule; // frente 3
  estimatedShare?: number; // 0–1 da base elegível
  dyAttribute?: string; // atributo publicado no DY via User Data API
}

export interface Allocation {
  platforms: Platform[];
  pages: string[]; // ids do catálogo de páginas
  trafficPercent: number; // % do público elegível no teste
  split: number[]; // ex.: [0.5, 0.5]
  startDate: string;
  endDate: string;
  exclusionGroupId?: string; // exclusão mútua (frente 3)
}

export type DyCampaignType = 'custom_code' | 'api_custom' | 'recommendation';

export interface DyLink {
  campaignName: string;
  campaignId?: string;
  campaignType?: DyCampaignType; // acréscimo 0.1.0 (frente 1)
  selector?: string;
  labels: string[]; // sempre inclui o faroId
  configuredAt?: string;
  configuredBy?: string;
}

export interface MetricDefinition {
  // dono: frente 4
  id: string; // ex.: "receita_por_usuario"
  name: string;
  section: 'Engajamento' | 'eCom' | 'Clube' | 'Saúde' | 'Fintech' | 'Serviços' | 'Atendimento' | 'Operação';
  kind: 'proportion' | 'mean' | 'ratio';
  direction: 'higher_better' | 'lower_better';
  unit: 'percent' | 'brl' | 'count' | 'seconds' | 'score';
  grains: ('user' | 'session')[];
  definition: string; // texto para humanos
  sqlTemplateRef: string; // referência ao modelo SQL versionado
  baseline?: number;
  cv?: number; // para cálculo de amostra
  owner: string;
  status: 'ativa' | 'rascunho' | 'depreciada';
}

export type SignificanceLabel =
  | 'melhora_confirmada' // P(melhor) ≥ 95%
  | 'tendencia_de_melhora' // 80% ≤ P < 95%
  | 'sem_tendencia' // 20% < P < 80%
  | 'tendencia_de_queda' // 5% < P ≤ 20%
  | 'queda_confirmada'; // P ≤ 5%

export interface MetricResult {
  // produzido pela frente 4
  faroId: string;
  metricId: string;
  platform: Platform | 'all';
  grain: 'user' | 'session';
  variantKey: string;
  value: number | null;
  n: number;
  deltaRelative?: number; // vs controle
  probBetter?: number; // 0–1, já considerando direction
  label?: SignificanceLabel;
  mde?: number;
  asOf: string; // data dos dados (D-1)
}

export interface OverlapDecision {
  // dono: frente 3
  otherFaroId: string;
  severity: 'baixo' | 'medio' | 'alto';
  estimatedDailyUsers: number;
  resolution?: 'exclusao_mutua' | 'paralelo' | 'reagendar';
  decidedBy?: string;
  decidedAt?: string;
}

export interface Decision {
  outcome: 'implementar_variante' | 'manter_controle' | 'sem_vencedor' | 'invalido';
  rationale: string;
  decidedBy: string;
  decidedAt: string;
  /** Unificação (frente 2, PNL-10): onde o aprendizado foi publicado; só https. */
  learningUrl?: string;
}

// ---- Acréscimos 0.1.0 (frente 1) ----

/** Divergência entre o planejado no Faro e o observado no export do DY (CFG-13). */
export interface ConfigDivergence {
  faroId: string;
  campaignId: string;
  refdate: string; // dia do export comparado (AAAA-MM-DD)
  kind: 'variacao_ausente' | 'variacao_extra' | 'nome_variacao' | 'split' | 'plataforma_ausente' | 'plataforma_extra';
  expected: string;
  observed: string;
  message: string;
}
