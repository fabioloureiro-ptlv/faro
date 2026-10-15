import type { Experiment, GovernanceAlert, MetricResult } from '@faro/contracts';
import type { PainelData, PainelRow } from './types';

const CONTROL_KEY = 'controle';

/** NORTE consolidada da melhor variante (maior probBetter). */
export function pickNorte(e: Experiment, results: MetricResult[]): MetricResult | undefined {
  const candidates = results.filter(
    (r) =>
      r.faroId === e.faroId &&
      r.metricId === e.design.primaryMetricId &&
      r.platform === 'all' &&
      r.variantKey !== CONTROL_KEY &&
      r.probBetter !== undefined,
  );
  return candidates.sort((a, b) => (b.probBetter ?? 0) - (a.probBetter ?? 0))[0];
}

export function buildRows(data: Pick<PainelData, 'experiments' | 'norteResults' | 'alerts'>): PainelRow[] {
  const alertsByExp = new Map<string, GovernanceAlert[]>();
  for (const a of data.alerts) {
    if (!a.faroId || a.resolvedAt) continue;
    const list = alertsByExp.get(a.faroId) ?? [];
    list.push(a);
    alertsByExp.set(a.faroId, list);
  }
  return data.experiments.map((experiment) => ({
    experiment,
    norte: pickNorte(experiment, data.norteResults),
    alerts: alertsByExp.get(experiment.faroId) ?? [],
  }));
}
