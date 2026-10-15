import { FARO_ID_PATTERN } from '@faro/contracts';

/** FARO-AAAA-NNNN. A sequência reinicia a cada ano. */
// DECISAO-PENDENTE: numeração por ano (o formato sugere isso); confirmar com Analytics (seção 7).
export function formatFaroId(year: number, seq: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new RangeError(`Ano inválido: ${year}`);
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) throw new RangeError(`Sequência fora de 1–9999: ${seq}`);
  return `FARO-${year}-${String(seq).padStart(4, '0')}`;
}

export function parseFaroId(id: string): { year: number; seq: number } | null {
  if (!FARO_ID_PATTERN.test(id)) return null;
  const [, y, s] = id.split('-');
  return { year: Number(y), seq: Number(s) };
}
