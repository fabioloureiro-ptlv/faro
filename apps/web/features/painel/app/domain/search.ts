import type { Experiment } from '@faro/contracts';

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** PNL-03: nome, faroId, nome da campanha DY e texto do design. */
export function searchableText(e: Experiment): string {
  const d = e.design;
  return normalize(
    [
      e.name,
      e.faroId,
      e.dy?.campaignName ?? '',
      d.context,
      d.hypothesis.change,
      d.hypothesis.expectedEffect,
      d.hypothesis.because,
      d.control.name,
      d.control.description,
      ...d.variants.flatMap((v) => [v.name, v.description]),
    ].join(' \u0000 '),
  );
}

/** Todos os termos precisam aparecer (AND), em qualquer ordem, sem acento e sem caixa. */
export function matchesSearch(e: Experiment, q: string): boolean {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const text = searchableText(e);
  return terms.every((t) => text.includes(t));
}
