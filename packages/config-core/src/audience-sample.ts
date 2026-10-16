// Amostra do experimento a partir do público contado (ajuste de produto 15/10).
// Público elegível (número da query no BigQuery, ou a participação do segmento × base de clientes) ×
// percentual do público abordado (tráfego da Definição) = amostra total; cada grupo leva a sua
// fatia do split. Tudo informativo: nunca impede avançar.

export interface AudienceSampleInput {
  /** Clientes do público contados no BigQuery; tem prioridade sobre a estimativa. */
  eligibleClients?: number | null;
  /** Participação do segmento na base (0–1), quando ainda não há contagem. */
  estimatedShare?: number | null;
  /** Base de clientes que converte a participação em número. */
  baseClients: number;
  /** Percentual do público que entra no experimento (0–100). */
  trafficPercent: number;
  /** Divisão entre grupos (soma 1). */
  split: number[];
}

export interface AudienceSample {
  /** 'bigquery' = número da query; 'estimado' = participação × base. */
  source: 'bigquery' | 'estimado';
  eligible: number;
  trafficPercent: number;
  total: number;
  perGroup: { share: number; size: number }[];
}

/** null quando não há como saber o tamanho do público (sem contagem e sem participação). */
export function audienceSample(input: AudienceSampleInput): AudienceSample | null {
  const counted = input.eligibleClients != null && input.eligibleClients >= 0 ? Math.round(input.eligibleClients) : null;
  const estimated = input.estimatedShare != null && input.estimatedShare > 0 ? Math.round(input.estimatedShare * input.baseClients) : null;
  const eligible = counted ?? estimated;
  if (eligible == null) return null;
  const pct = Math.min(100, Math.max(0, input.trafficPercent));
  const total = Math.round((eligible * pct) / 100);
  return {
    source: counted != null ? 'bigquery' : 'estimado',
    eligible,
    trafficPercent: pct,
    total,
    perGroup: input.split.map((share) => ({ share, size: Math.round(total * share) })),
  };
}
