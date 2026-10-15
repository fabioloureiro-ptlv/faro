// Sugestão de datas (ajuste de produto 15/10): a partir da duração mínima (CFG-08), propõe
// um período e mostra os testes interpostos — os que já ocupam as mesmas páginas e
// plataformas nesse intervalo — e a próxima janela livre.
import { MIN_DAYS } from './duration.ts';

export interface BusyWindow {
  faroId: string;
  name: string;
  startDate: string; // AAAA-MM-DD
  endDate: string; // AAAA-MM-DD
}

export interface DateSuggestionInput {
  today: string; // AAAA-MM-DD
  /** Duração mínima calculada (CFG-08); null quando ainda não há amostra ou elegíveis. */
  durationDays: number | null;
  /** Testes ativos ou agendados que cruzam páginas e plataformas com este. */
  busy: BusyWindow[];
}

export interface DateWindow {
  startDate: string;
  endDate: string;
  days: number;
}

export interface DateSuggestion extends DateWindow {
  /** 'amostra' quando veio da duração calculada; 'minimo' quando só os 7 dias de ciclo semanal. */
  basedOn: 'amostra' | 'minimo';
  /** Testes interpostos na janela sugerida. */
  overlapping: BusyWindow[];
  /** Primeira janela sem teste interposto, quando a sugerida tem algum. */
  freeWindow?: DateWindow & { afterFaroIds: string[] };
}

// DECISAO-PENDENTE: antecedência de 1 dia e janela arredondada para semanas inteiras
// (cobre o ciclo semanal de compras mesmo com início no meio da semana).
export const LEAD_DAYS = 1;
const MAX_SHIFTS = 20;

export function addDays(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** Dias da janela: pelo menos MIN_DAYS, arredondados para múltiplo de 7. */
export function suggestedDays(durationDays: number | null): number {
  const base = Math.max(MIN_DAYS, durationDays ?? MIN_DAYS);
  return Math.ceil(base / 7) * 7;
}

const intersects = (w: DateWindow, b: BusyWindow) => !(w.endDate < b.startDate || b.endDate < w.startDate);

function windowFrom(startDate: string, days: number): DateWindow {
  return { startDate, endDate: addDays(startDate, days - 1), days };
}

export function suggestDates(input: DateSuggestionInput): DateSuggestion {
  const days = suggestedDays(input.durationDays);
  const first = windowFrom(addDays(input.today, LEAD_DAYS), days);
  const overlapping = input.busy.filter((b) => intersects(first, b)).sort((a, b) => a.endDate.localeCompare(b.endDate));
  const out: DateSuggestion = { ...first, basedOn: input.durationDays != null ? 'amostra' : 'minimo', overlapping };
  if (!overlapping.length) return out;

  // Próxima janela livre: empurra o início para depois do último interposto, até não cruzar.
  let w = first;
  const after = new Set<string>();
  for (let i = 0; i < MAX_SHIFTS; i++) {
    const hits = input.busy.filter((b) => intersects(w, b));
    if (!hits.length) {
      out.freeWindow = { ...w, afterFaroIds: [...after] };
      return out;
    }
    const lastEnd = hits.map((h) => h.endDate).sort().at(-1)!;
    for (const h of hits) after.add(h.faroId);
    w = windowFrom(addDays(lastEnd, 1), days);
  }
  return out;
}
