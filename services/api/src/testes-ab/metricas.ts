// Aba Teste AB — as 16 métricas da consulta de resultados (dy_results v3) e as faixas de significância.
// Espelha a especificação "Testes A/B" (seções 6.3 e 7.1): a coluna SQL é o prefixo das colunas
// uplift_/ic_lo_/ic_hi_/p_vence_/mde_/papel_/confirmado_/recomendacao_<coluna>.
import type { ResultsRow } from '../resultados/roadmap/types.ts';

export type Formato = 'brl' | 'pct' | 'num' | 'num4';
export type GrupoMetrica = 'ecom' | 'clube' | 'saude';

export interface MetricaDef {
  key: string;
  col: string;
  label: string;
  grupo: GrupoMetrica;
  formato: Formato;
  /** Churn: quanto menor, melhor. */
  menorMelhor?: boolean;
}

export const METRICAS: MetricaDef[] = [
  { key: 'rpu', col: 'receita_por_unidade', label: 'Receita por unidade', grupo: 'ecom', formato: 'brl' },
  { key: 'conv', col: 'conversao', label: 'Conversão', grupo: 'ecom', formato: 'pct' },
  { key: 'tpu', col: 'transacoes_por_unidade', label: 'Transações por unidade', grupo: 'ecom', formato: 'num4' },
  { key: 'ticket', col: 'ticket', label: 'Ticket médio', grupo: 'ecom', formato: 'brl' },
  { key: 'rbf', col: 'receita_bruta_faturada_por_unidade', label: 'Receita faturada por unidade', grupo: 'ecom', formato: 'brl' },
  { key: 'm2', col: 'margem2_por_unidade', label: 'Margem 2 por unidade', grupo: 'ecom', formato: 'brl' },
  { key: 'cart', col: 'conversao_carrinho', label: 'Conversão para o carrinho', grupo: 'ecom', formato: 'pct' },
  { key: 'repet', col: 'conversao_repet_nova', label: 'Conversão em repet nova', grupo: 'ecom', formato: 'pct' },
  { key: 'clube', col: 'conversao_clube', label: 'Conversão no clube', grupo: 'clube', formato: 'pct' },
  { key: 'clube_rpu', col: 'receita_clube_por_unidade', label: 'Receita do clube por unidade', grupo: 'clube', formato: 'brl' },
  { key: 'clube_churn', col: 'churn_clube', label: 'Churn do clube', grupo: 'clube', formato: 'pct', menorMelhor: true },
  { key: 'saude', col: 'conversao_saude', label: 'Conversão em saúde', grupo: 'saude', formato: 'pct' },
  { key: 'vidas', col: 'vidas_por_unidade', label: 'Vidas por unidade', grupo: 'saude', formato: 'num4' },
  { key: 'saude_rpu', col: 'receita_saude_por_unidade', label: 'Receita de saúde por unidade', grupo: 'saude', formato: 'brl' },
  { key: 'saude_ticket', col: 'ticket_saude', label: 'Ticket de saúde', grupo: 'saude', formato: 'brl' },
  { key: 'saude_churn', col: 'churn_saude', label: 'Churn de saúde', grupo: 'saude', formato: 'pct', menorMelhor: true },
];

export const METRICA_PADRAO = 'rpu';
export const metricaPorKey = (key: string | undefined) => METRICAS.find((m) => m.key === key) ?? METRICAS[0]!;
export const metricaPorColuna = (col: string | null | undefined) => METRICAS.find((m) => m.col === col);

/** Leitura segura de uma coluna numérica da linha (a consulta devolve null quando não há dado). */
export function num(row: ResultsRow, col: string): number | null {
  const v = (row as Record<string, unknown>)[col];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
export function texto(row: ResultsRow, col: string): string | null {
  const v = (row as Record<string, unknown>)[col];
  return typeof v === 'string' && v.trim() ? v : null;
}
export function flag(row: ResultsRow, col: string): boolean {
  const v = (row as Record<string, unknown>)[col];
  return v === true || v === 1 || v === '1';
}

export type TomSig = 'good' | 'good-outline' | 'neutral' | 'warn' | 'bad';
export interface Significancia {
  seta: '▲' | '▼' | '—';
  rotulo: string;
  /** P(variante > controle) em porcentagem inteira. */
  p: number;
  tom: TomSig;
}

/** Faixas da seção 7.1: ≥95 melhora confirmada · 85–95 tendência de melhora · 15–85 sem tendência · 5–15 tendência de queda · ≤5 queda confirmada. */
export function significancia(p: number | null | undefined): Significancia | null {
  if (p == null || !Number.isFinite(p)) return null;
  const pct = Math.round(p * 100);
  if (p >= 0.95) return { seta: '▲', rotulo: 'Melhora confirmada', p: pct, tom: 'good' };
  if (p >= 0.85) return { seta: '▲', rotulo: 'Tendência de melhora', p: pct, tom: 'good-outline' };
  if (p > 0.15) return { seta: '—', rotulo: 'Sem tendência', p: pct, tom: 'neutral' };
  if (p > 0.05) return { seta: '▼', rotulo: 'Tendência de queda', p: pct, tom: 'warn' };
  return { seta: '▼', rotulo: 'Queda confirmada', p: pct, tom: 'bad' };
}

export interface StatusTeste {
  key: 'saudavel' | 'split_desigual' | 'volume_baixo' | 'decidido';
  rotulo: string;
  tom: 'good' | 'warn' | 'neutral' | 'muted';
  dica: string;
}

const STATUS: Record<StatusTeste['key'], StatusTeste> = {
  saudavel: { key: 'saudavel', rotulo: 'saudável', tom: 'good', dica: 'Split equilibrado e volume suficiente para ler o resultado.' },
  split_desigual: { key: 'split_desigual', rotulo: 'split desigual', tom: 'warn', dica: 'Alguma variante desvia mais de 1,5 ponto do split planejado.' },
  volume_baixo: { key: 'volume_baixo', rotulo: 'volume baixo', tom: 'neutral', dica: 'Menos de 50 transações em alguma variante.' },
  decidido: { key: 'decidido', rotulo: 'decidido', tom: 'muted', dica: 'Uma variante já tem quase todo o tráfego: o teste foi decidido e a campanha ainda está ligada.' },
};

export function statusDe(raw: string | null | undefined): StatusTeste {
  const t = (raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '_');
  return STATUS[t as StatusTeste['key']] ?? STATUS.saudavel;
}
