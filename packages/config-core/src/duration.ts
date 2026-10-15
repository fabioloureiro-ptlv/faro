// Duração e viabilidade (CFG-08).

export const MIN_DAYS = 7;
export const MAX_DAYS = 42;

export type ViabilityAlert = {
  level: 'bloqueio' | 'alerta';
  code: 'periodo_insuficiente' | 'menos_de_7_dias' | 'mais_de_6_semanas' | 'sem_elegiveis' | 'periodo_invalido';
  message: string;
};

export interface DurationInput {
  nPerGroup: number | null;
  eligibleDaily: number;
  split: number[];
  startDate: string;
  endDate: string;
}

export interface DurationResult {
  totalSample: number | null;
  durationDays: number | null;
  periodDays: number | null;
  alerts: ViabilityAlert[];
  blocking: boolean;
}

/** Dias corridos do período, contando início e fim. */
export function periodDays(startDate: string, endDate: string): number | null {
  const a = Date.parse(`${startDate}T00:00:00Z`);
  const b = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function estimateDuration(input: DurationInput): DurationResult {
  const { nPerGroup, eligibleDaily, split } = input;
  const alerts: ViabilityAlert[] = [];
  const period = periodDays(input.startDate, input.endDate);
  if (period == null)
    alerts.push({ level: 'bloqueio', code: 'periodo_invalido', message: 'Defina início e fim, com o fim depois do início.' });

  const positive = split.filter((s) => s > 0);
  const minShare = positive.length === split.length && positive.length > 0 ? Math.min(...positive) : 0;

  // DECISAO-PENDENTE: com split desigual, o menor grupo precisa atingir n. Para split igual
  // isso equivale a "amostra total ÷ elegíveis por dia".
  const totalSample = nPerGroup != null && minShare > 0 ? Math.ceil(nPerGroup / minShare) : null;
  let durationDays: number | null = null;

  if (!(eligibleDaily > 0)) {
    alerts.push({ level: 'bloqueio', code: 'sem_elegiveis', message: 'Escolha ao menos uma página e uma plataforma para estimar os elegíveis.' });
  } else if (nPerGroup != null && minShare > 0) {
    durationDays = Math.ceil(nPerGroup / (eligibleDaily * minShare));
    if (period != null && durationDays > period)
      alerts.push({
        level: 'bloqueio',
        code: 'periodo_insuficiente',
        message: `O período tem ${period} dias, mas o teste precisa de ${durationDays}. Aumente o tráfego, amplie o público, estenda as datas ou aceite um efeito mínimo maior.`,
      });
    if (durationDays < MIN_DAYS)
      alerts.push({ level: 'alerta', code: 'menos_de_7_dias', message: 'Rode por pelo menos 7 dias para cobrir o ciclo semanal de compras, mesmo atingindo a amostra antes.' });
    if (durationDays > MAX_DAYS)
      alerts.push({ level: 'alerta', code: 'mais_de_6_semanas', message: 'Mais de 6 semanas: o público muda e outros testes entram no caminho. Avalie um efeito mínimo maior.' });
  }

  return { totalSample, durationDays, periodDays: period, alerts, blocking: alerts.some((a) => a.level === 'bloqueio') };
}
