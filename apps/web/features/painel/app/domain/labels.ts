import type {
  Bu,
  ExperimentStatus,
  GovernanceAlert,
  OverlapDecision,
  Platform,
  SignificanceLabel,
} from '@faro/contracts';
import { RULE_LABEL } from '@faro/api/experiments/governance';

// Linguagem do time, não do sistema (contexto, seção 11).

export const BU_LABEL: Record<Bu, string> = {
  ecom: 'Ecom',
  saude: 'Saúde',
  fintech: 'Fintech',
  servicos: 'Serviços',
  ecossistema: 'Ecossistema',
};

export const STATUS_LABEL: Record<ExperimentStatus, string> = {
  rascunho: 'Rascunho',
  design_completo: 'Design completo',
  pronto_para_configurar: 'Pronto para configurar',
  configurado_no_dy: 'Configurado no DY',
  rodando: 'Rodando',
  decidido: 'Decidido',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

export const PLATFORM_LABEL: Record<Platform, string> = { site: 'Site', android: 'Android', ios: 'iOS' };

export const SIGNIFICANCE_LABEL: Record<SignificanceLabel, string> = {
  melhora_confirmada: 'Melhora confirmada',
  tendencia_de_melhora: 'Tendência de melhora',
  sem_tendencia: 'Sem tendência',
  tendencia_de_queda: 'Tendência de queda',
  queda_confirmada: 'Queda confirmada',
};

export const OVERLAP_LABEL: Record<OverlapDecision['severity'], string> = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
};

export const ALERT_SEVERITY_LABEL: Record<GovernanceAlert['severity'], string> = {
  info: 'Info',
  atencao: 'Atenção',
  critico: 'Crítico',
};

/** Mesmo texto das mensagens e notificações do motor de governança. */
export const ALERT_RULE_LABEL = RULE_LABEL;

export function formatDayMonth(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function formatSignedPercent(x: number): string {
  const s = (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (x > 0 ? '+' : x < 0 ? '−' : '') + s.replace('-', '') + '%';
}
