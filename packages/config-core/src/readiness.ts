// Prontidão para configurar (etapas Público, Sobreposição e Revisão) e transições de status.
import type { Experiment, ExperimentStatus, OverlapDecision } from '@faro/contracts';
import type { DurationResult } from './duration.ts';
import type { GateResult } from './design-gate.ts';

export type ReadinessCheckId =
  | 'publico'
  | 'plataformas'
  | 'paginas'
  | 'trafego'
  | 'split'
  | 'datas'
  | 'viabilidade'
  | 'sobreposicao';

export interface ReadinessCheck {
  id: ReadinessCheckId;
  label: string;
  ok: boolean;
  message?: string;
}

const SPLIT_EPS = 1e-6;

export function splitIsValid(split: number[], groups: number): boolean {
  if (split.length !== groups || split.some((s) => !(s > 0))) return false;
  return Math.abs(split.reduce((a, b) => a + b, 0) - 1) < SPLIT_EPS;
}

/** Conflitos médio e alto exigem resolução (CFG-09). */
export function pendingOverlaps(overlap: OverlapDecision[] | undefined): OverlapDecision[] {
  return (overlap ?? []).filter((o) => o.severity !== 'baixo' && !o.resolution);
}

export function audienceChecks(exp: Experiment, duration: DurationResult): ReadinessCheck[] {
  const a = exp.allocation;
  const groups = 1 + exp.design.variants.length;
  const datesOk = !!a.startDate && !!a.endDate && a.endDate > a.startDate;
  const c = (id: ReadinessCheckId, label: string, ok: boolean, message: string): ReadinessCheck =>
    ok ? { id, label, ok } : { id, label, ok, message };
  return [
    c('publico', 'Quem entra no teste', exp.audience.description.trim().length >= 3, 'Descreva quem entra no teste.'),
    c('plataformas', 'Plataformas', a.platforms.length > 0, 'Escolha ao menos uma plataforma.'),
    c('paginas', 'Páginas', a.pages.length > 0, 'Escolha ao menos uma página.'),
    c('trafego', 'Tráfego no experimento', a.trafficPercent > 0 && a.trafficPercent <= 100, 'O tráfego precisa ficar entre 1% e 100%.'),
    c('split', 'Divisão entre grupos', splitIsValid(a.split, groups), `A divisão precisa ter ${groups} grupos maiores que zero somando 100%.`),
    c('datas', 'Período', datesOk, 'Defina início e fim, com o fim depois do início.'),
    c(
      'viabilidade',
      'Cabe no período',
      !duration.blocking,
      duration.alerts.find((x) => x.level === 'bloqueio')?.message ?? '',
    ),
  ];
}

export function overlapCheck(exp: Experiment): ReadinessCheck {
  const pend = pendingOverlaps(exp.overlap).length;
  return pend === 0
    ? { id: 'sobreposicao', label: 'Sobreposição resolvida', ok: true }
    : {
        id: 'sobreposicao',
        label: 'Sobreposição resolvida',
        ok: false,
        message: `${pend} ${pend > 1 ? 'conflitos de risco médio ou alto precisam' : 'conflito de risco médio ou alto precisa'} de uma decisão.`,
      };
}

export type WizardStep = 1 | 2 | 3 | 4;

/** Etapas liberadas (CFG-01): 2 exige design; 3 exige público; 4 exige sobreposição resolvida. */
export function unlockedSteps(gate: GateResult, audience: ReadinessCheck[], overlap: ReadinessCheck): WizardStep[] {
  const steps: WizardStep[] = [1];
  if (!gate.complete) return steps;
  steps.push(2);
  if (!audience.every((c) => c.ok)) return steps;
  steps.push(3);
  if (!overlap.ok) return steps;
  steps.push(4);
  return steps;
}

/** Status que a frente 1 controla. Os demais pertencem à frente 2. */
const PRE_DY: ExperimentStatus[] = ['rascunho', 'design_completo', 'pronto_para_configurar'];

/**
 * Status após salvar. Só mexe nos status pré-DY: design incompleto volta a rascunho, e uma
 * edição que quebre a prontidão volta a design_completo. A promoção a pronto_para_configurar
 * é explícita (POST /ready).
 */
export function statusAfterSave(current: ExperimentStatus, gateComplete: boolean, ready: boolean): ExperimentStatus {
  if (!PRE_DY.includes(current)) return current;
  if (!gateComplete) return 'rascunho';
  if (current === 'pronto_para_configurar' && ready) return current;
  return 'design_completo';
}

export function isPreDy(status: ExperimentStatus): boolean {
  return PRE_DY.includes(status);
}
