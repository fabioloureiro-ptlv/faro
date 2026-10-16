import type { Platform, SignificanceLabel, Synthesis, SynthesisPart } from '@faro/contracts';
import { LABEL_TEXT } from './labels.ts';

export interface SynthesisInput {
  variantKey: string;
  variantName: string;
  platform: Platform | 'all';
  metrics: SynthesisPart[];
  /** Quantas métricas além da métrica principal. Padrão 3. */
  maxOthers?: number;
}

const RELEVANT: SignificanceLabel[] = ['melhora_confirmada', 'queda_confirmada', 'tendencia_de_queda'];
const PLATFORM_TEXT: Record<Platform | 'all', string> = { all: 'consolidado', site: 'site', android: 'Android', ios: 'iOS' };

export function formatDelta(d: number): string {
  const v = (d * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return d > 0 ? `+${v}%` : d < 0 ? `−${v.replace('-', '')}%` : `${v}%`;
}

function piece(p: SynthesisPart): string {
  const tag = p.role === 'norte' ? 'métrica principal ' : '';
  return `${tag}${p.name.toLowerCase()} ${formatDelta(p.deltaRelative)} (${LABEL_TEXT[p.label]}, ${Math.round(p.probBetter * 100)}%)`;
}

/**
 * Síntese (MET-13): a NORTE e até três métricas mais relevantes (confirmadas ou em queda), ordenadas por |delta|,
 * no formato do visualizador atual.
 */
export function synthesize(input: SynthesisInput): Synthesis {
  const norte = input.metrics.find((m) => m.role === 'norte');
  const others = input.metrics
    .filter((m) => m.role !== 'norte' && RELEVANT.includes(m.label) && Number.isFinite(m.deltaRelative))
    .sort((a, b) => Math.abs(b.deltaRelative) - Math.abs(a.deltaRelative))
    .slice(0, input.maxOthers ?? 3);
  const parts = [...(norte ? [norte] : []), ...others];
  const text = `${input.variantName} (${PLATFORM_TEXT[input.platform]}): ${parts.map(piece).join(' · ')}.`;
  return { variantKey: input.variantKey, variantName: input.variantName, platform: input.platform, text, parts };
}
