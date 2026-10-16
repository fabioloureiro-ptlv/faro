// Números no formato pt-BR da especificação: 1.080.138 · R$ 143,72 · +2,9% · sinal de menos tipográfico (−).
import type { Formato } from './types';

const MENOS = '−';
const nb = (n: number, min: number, max = min) => n.toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max }).replace('-', MENOS);

export function fmtValor(v: number | null | undefined, formato: Formato): string {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (formato) {
    case 'brl': return `R$ ${nb(v, 2)}`;
    case 'pct': return `${nb(v * 100, 2)}%`;
    case 'num4': return nb(v, 4);
    case 'num': return nb(v, 0, 2);
    case 'int': return nb(Math.round(v), 0);
  }
}

/** Variação relativa: +2,9% · −0,2% (com sinal de mais). */
export function fmtDelta(v: number | null | undefined, casas = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = Math.abs(v * 100) < 0.05 ? 0 : v * 100;
  return `${r > 0 ? '+' : ''}${nb(r, casas)}%`;
}

export const fmtPct = (v: number | null | undefined, casas = 1) => (v == null ? '—' : `${nb(v * 100, casas)}%`);
export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : nb(Math.round(n), 0));

/** AAAA-MM-DD → dd/mm (ou dd/mm/aaaa). */
export function fmtData(iso: string | null | undefined, ano = false): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return ano ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const rotuloStream = (s: string) => (s === 'app' ? 'APP' : 'WEB');
