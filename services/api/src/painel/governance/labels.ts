import type { GovernanceRule } from '@faro/contracts';
import type { DesignField } from './design.ts';

// Linguagem do time (contexto, seção 11). Usado nas mensagens de alerta, nas notificações e na UI.

export const RULE_LABEL: Record<GovernanceRule, string> = {
  design_incompleto: 'Design incompleto',
  decidido_ativo: 'Decidido e ainda ativo',
  split_extremo: 'Split extremo',
  srm: 'Divisão desbalanceada (SRM)',
  parada_antecipada: 'Risco de parar cedo',
  passou_da_data: 'Passou da data de fim',
  sem_exposicao: 'Sem exposição',
  divergencia_config: 'Configuração divergente',
  conflito_sem_resolucao: 'Conflito sem decisão',
  campanha_orfa: 'Campanha órfã',
};

export const DESIGN_FIELD_LABEL: Record<DesignField, string> = {
  context: 'contexto',
  'hypothesis.change': 'o que muda',
  'hypothesis.expectedEffect': 'efeito esperado',
  'hypothesis.because': 'porquê',
  'control.description': 'descrição do controle',
  'variants.description': 'descrição das variantes',
};
