import type { ExperimentStatus, Recommendation, SignificanceLabel } from '@faro/contracts';
import { LABEL_THRESHOLDS } from './labels.ts';
import { SRM_ALERT_P } from './srm.ts';

export interface RecommendInput {
  status: ExperimentStatus;
  hasData: boolean;
  srmPValue?: number;
  variants: { key: string; name: string; isControl: boolean; observedShare?: number }[];
  primary?: { name: string; probBetter?: number; label?: SignificanceLabel };
  guardrails?: { metricId: string; name: string; probBetter?: number }[];
  sampleProgress?: number; // 0–1
  minPerArm?: number;
  requiredPerArm?: number;
  decisionText?: string;
}

/** Uma variante com ≥ 95% dos expostos: a campanha virou rollout e não produz mais leitura. */
export const FULL_TRAFFIC_SHARE = 0.95;

const fmtPct = (x: number, d = 0) => (x * 100).toFixed(d).replace('.', ',') + '%';
const fmtInt = (x: number) => Math.round(x).toLocaleString('pt-BR');

/** Regras de "o que fazer" (MET-12), avaliadas nesta ordem. */
export function recommend(i: RecommendInput): Recommendation {
  if (i.status === 'encerrado' || i.status === 'decidido' || i.status === 'cancelado') {
    return { code: 'encerrado', title: i.decisionText ?? 'Encerrado', body: 'Teste encerrado. Campanha desligada no DY.', severity: 'ok' };
  }
  if (!i.hasData) {
    return { code: 'aguardando_dados', title: 'Aguardando início', body: 'Os dados aparecem assim que a primeira exposição for registrada.', severity: 'info' };
  }
  if (i.srmPValue != null && i.srmPValue < SRM_ALERT_P) {
    const shares = i.variants.map((v) => (v.observedShare != null ? fmtPct(v.observedShare) : '?')).join(' × ');
    return { code: 'investigar_srm', title: 'Investigar a alocação antes de decidir', body: `Os grupos estão em ${shares}, fora do split planejado (SRM). Qualquer leitura agora pode estar enviesada. Verifique regras de exibição e gatilhos no DY.`, severity: 'risk' };
  }
  const full = i.variants.find((v) => !v.isControl && (v.observedShare ?? 0) >= FULL_TRAFFIC_SHARE);
  if (full) {
    return { code: 'desligar_campanha', title: 'Desligar a campanha no Dynamic Yield', body: `${full.name} já está com ~100% do tráfego. O teste não produz mais leitura e o controle residual só gera ruído.`, severity: 'warn' };
  }
  const bad = (i.guardrails ?? []).filter((g) => g.probBetter != null && g.probBetter <= LABEL_THRESHOLDS.dropped);
  if (bad.length) {
    return { code: 'avaliar_guardrail', title: 'Avaliar o trade-off com o guardrail', body: `${bad.map((g) => g.name).join(', ')} piorou de forma confirmada. Discuta com o time antes de implementar.`, severity: 'warn' };
  }
  const p = i.primary?.probBetter;
  const prog = i.sampleProgress ?? 0;
  const norte = i.primary?.name ?? 'métrica norte';
  if (p != null && p >= LABEL_THRESHOLDS.confirmed && prog >= 1) {
    return { code: 'implementar', title: 'Implementar a variante e desligar a campanha no DY', body: `A ${norte} melhorou de forma confirmada e a amostra planejada foi atingida.`, severity: 'ok' };
  }
  if (p != null && p >= LABEL_THRESHOLDS.confirmed) {
    const detail = i.minPerArm != null && i.requiredPerArm != null ? ` (${fmtInt(i.minPerArm)} de ${fmtInt(i.requiredPerArm)} por grupo)` : '';
    return { code: 'manter_ate_amostra', title: 'Manter rodando até a amostra planejada', body: `A ${norte} já aparece como melhora confirmada, mas só ${fmtPct(prog)} da amostra planejada foi coletada${detail}. Parar agora aumenta o risco de falso positivo.`, severity: 'warn' };
  }
  if (p != null && p <= LABEL_THRESHOLDS.dropped) {
    return { code: 'desligar_variante', title: 'Desligar a variante', body: `A ${norte} piorou de forma confirmada.`, severity: 'risk' };
  }
  if (prog >= 1) {
    return { code: 'encerrar_sem_vencedor', title: 'Encerrar sem vencedor', body: `A amostra planejada foi atingida e a ${norte} não mostrou diferença confiável.`, severity: 'warn' };
  }
  return { code: 'manter_rodando', title: 'Manter rodando', body: `Ainda sem leitura conclusiva na ${norte}. ${fmtPct(prog)} da amostra planejada coletada.`, severity: 'warn' };
}
