import type { Design } from '@faro/contracts';

export type DesignField =
  | 'context'
  | 'hypothesis.change'
  | 'hypothesis.expectedEffect'
  | 'hypothesis.because'
  | 'control.description'
  | 'variants.description';

const blank = (s: string) => s.trim().length === 0;

/**
 * Campos textuais obrigatórios do design que estão vazios. Figma é opcional no contrato,
 * então não entra. O gate formal é da frente 1; aqui serve à exibição e à regra
 * `design_incompleto` (PNL-08).
 */
export function missingDesignFields(d: Design): DesignField[] {
  const missing: DesignField[] = [];
  if (blank(d.context)) missing.push('context');
  if (blank(d.hypothesis.change)) missing.push('hypothesis.change');
  if (blank(d.hypothesis.expectedEffect)) missing.push('hypothesis.expectedEffect');
  if (blank(d.hypothesis.because)) missing.push('hypothesis.because');
  if (blank(d.control.description)) missing.push('control.description');
  if (d.variants.some((v) => blank(v.description))) missing.push('variants.description');
  return missing;
}
