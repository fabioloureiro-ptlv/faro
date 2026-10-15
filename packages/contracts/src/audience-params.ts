// Parâmetros de segmento (0.5.0): validação dos valores escolhidos e nome do atributo no DY.
// Puro e sem dependências, para a API (validação e execução) e o wizard (valores padrão) usarem igual.
import type { AudienceParameter } from './catalogs.ts';

export type ResolvedParams = { ok: true; values: Record<string, number> } | { ok: false; message: string };

/** Valores padrão do segmento (o que o wizard preenche ao escolhê-lo). */
export function defaultAudienceParams(parameters: readonly AudienceParameter[] | undefined): Record<string, number> {
  return Object.fromEntries((parameters ?? []).map((p) => [p.name, p.default]));
}

/**
 * Junta o que foi informado com os padrões e valida: nomes conhecidos, número (inteiro quando
 * o tipo pede), dentro de min/max. Aceita texto numérico (vem da query string).
 */
export function resolveAudienceParams(parameters: readonly AudienceParameter[] | undefined, provided: Record<string, unknown> = {}): ResolvedParams {
  const declared = parameters ?? [];
  for (const name of Object.keys(provided)) {
    if (!declared.some((p) => p.name === name)) return { ok: false, message: `Parâmetro desconhecido: ${name}.` };
  }
  const values: Record<string, number> = {};
  for (const p of declared) {
    const raw = provided[p.name];
    const value = raw === undefined || raw === '' ? p.default : typeof raw === 'string' ? Number(raw) : raw;
    if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, message: `${p.label}: informe um número.` };
    if (p.type === 'integer' && !Number.isInteger(value)) return { ok: false, message: `${p.label}: informe um número inteiro.` };
    if (p.min !== undefined && value < p.min) return { ok: false, message: `${p.label}: o mínimo é ${p.min}.` };
    if (p.max !== undefined && value > p.max) return { ok: false, message: `${p.label}: o máximo é ${p.max}.` };
    values[p.name] = value;
  }
  return { ok: true, values };
}

/** Atributo no DY por valor de parâmetro: `faro_aud_inadimplentes` + 60 → `faro_aud_inadimplentes_60`. */
export function audienceAttributeFor(
  base: string | undefined,
  parameters: readonly AudienceParameter[] | undefined,
  values: Record<string, number>,
): string | undefined {
  if (!base || !parameters?.length) return base;
  const sufixo = parameters.map((p) => String(values[p.name] ?? p.default).replace(/[^0-9a-z]/gi, '_')).join('_');
  return `${base}_${sufixo}`;
}
