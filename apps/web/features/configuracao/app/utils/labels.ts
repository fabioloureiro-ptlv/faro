import type { Bu, ExperimentStatus, Platform } from '@faro/contracts';

export const BU_LABEL: Record<Bu, string> = { ecom: 'Ecom', saude: 'Saúde', fintech: 'Fintech', servicos: 'Serviços', ecossistema: 'Ecossistema' };
export const PLATFORM_LABEL: Record<Platform, string> = { site: 'Site', android: 'App Android', ios: 'App iOS' };
export const STATUS_LABEL: Record<ExperimentStatus, [string, string]> = {
  rascunho: ['Rascunho', 'mutedp'],
  design_completo: ['Design completo', 'brandp'],
  pronto_para_configurar: ['Pronto para configurar', 'warnp'],
  configurado_no_dy: ['Configurado no DY', 'okp'],
  rodando: ['Rodando', 'okp'],
  decidido: ['Decidido', 'warnp'],
  encerrado: ['Encerrado', 'mutedp'],
  cancelado: ['Cancelado', 'mutedp'],
};
export const fmtInt = (n: number) => Math.round(n).toLocaleString('pt-BR');
export const fmtPct = (x: number, d = 1) => `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
export const fmtDate = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
