// Gate de design (CFG-02, CFG-03, CFG-04). Cada regra é isolada e diz o que corrigir.
import type { Bu, Design, Experiment } from '@faro/contracts';
import { isFigmaUrl } from './figma.ts';

export type DesignInput = Pick<Experiment, 'name' | 'bu' | 'ownerSquad'> & { design: Design };

export type GateCheckId =
  | 'nome'
  | 'bu'
  | 'squad'
  | 'contexto'
  | 'hipotese'
  | 'controle_variantes'
  | 'metrica_primaria'
  | 'metricas_secundarias'
  | 'primaria_fora_das_secundarias'
  | 'mde'
  | 'midia_variantes'
  | 'figma';

export interface GateCheck {
  id: GateCheckId;
  label: string;
  ok: boolean;
  /** Presente quando `ok` é falso: o que corrigir. */
  message?: string;
}

export interface GateResult {
  complete: boolean;
  checks: GateCheck[];
  done: number;
  total: number;
}

export const MIN_NAME = 4;
export const MIN_CONTEXT = 60;
const MIN_PART = 3;
const BUS: readonly Bu[] = ['ecom', 'saude', 'fintech', 'servicos', 'ecossistema'];

const filled = (s: string | undefined, min = MIN_PART) => (s ?? '').trim().length >= min;

function check(id: GateCheckId, label: string, ok: boolean, message: string): GateCheck {
  return ok ? { id, label, ok } : { id, label, ok, message };
}

/**
 * Avalia o design. `knownMetricIds`, quando informado, exige que as métricas existam no catálogo.
 */
export function evaluateDesignGate(input: DesignInput, knownMetricIds?: ReadonlySet<string>): GateResult {
  const { design: d } = input;
  const h = d.hypothesis;
  const known = (id: string) => !knownMetricIds || knownMetricIds.has(id);
  const variantsOk =
    d.variants.length >= 1 && d.variants.every((v) => filled(v.name, 1) && filled(v.description));
  const figmaUrls = [d.control.figmaUrl, ...d.variants.map((v) => v.figmaUrl)].filter(
    (u): u is string => !!u && u.trim() !== '',
  );
  // Ajuste de produto (14/10): toda variante precisa de Figma válido OU print.
  // Sem variantes, quem acusa é controle_variantes; esta regra fica neutra.
  const isPrint = (u?: string) => !!u && /^(https:\/\/|data:image\/)/.test(u.trim());
  const mediaOk = d.variants.every((v) => isFigmaUrl(v.figmaUrl ?? '') || isPrint(v.printUrl));

  const checks: GateCheck[] = [
    check('nome', 'Nome do experimento', filled(input.name, MIN_NAME), `Dê um nome com pelo menos ${MIN_NAME} caracteres.`),
    check('bu', 'BU', BUS.includes(input.bu), 'Escolha a BU. Use Ecossistema quando o teste afeta mais de uma.'),
    check('squad', 'Squad responsável', filled(input.ownerSquad, 2), 'Informe o squad responsável.'),
    check(
      'contexto',
      `Contexto do problema, com evidência (mín. ${MIN_CONTEXT} caracteres)`,
      filled(d.context, MIN_CONTEXT),
      `Descreva o problema e a evidência (dado, pesquisa, benchmark). Faltam ${Math.max(0, MIN_CONTEXT - d.context.trim().length)} caracteres.`,
    ),
    check(
      'hipotese',
      'Hipótese no formato “se… então… porque…”',
      filled(h.change) && filled(h.expectedEffect) && filled(h.because),
      `Preencha ${[
        !filled(h.change) && '“Se” (a mudança)',
        !filled(h.expectedEffect) && '“então” (o efeito esperado)',
        !filled(h.because) && '“porque” (o motivo)',
      ]
        .filter(Boolean)
        .join(', ')}.`,
    ),
    check(
      'controle_variantes',
      'O que muda: controle e ao menos uma variante descritos',
      filled(d.control.description) && variantsOk,
      !filled(d.control.description)
        ? 'Descreva como é hoje (controle).'
        : 'Descreva cada variante: nome e o que muda.',
    ),
    check(
      'metrica_primaria',
      'Exatamente uma métrica principal',
      d.primaryMetricId.trim() !== '' && known(d.primaryMetricId),
      d.primaryMetricId.trim() === ''
        ? 'Escolha a métrica primária. Só uma: é ela que decide o teste.'
        : 'A métrica primária não existe no catálogo.',
    ),
    check(
      'metricas_secundarias',
      'Pelo menos uma métrica secundária',
      d.secondaryMetricIds.length >= 1 && d.secondaryMetricIds.every(known),
      d.secondaryMetricIds.length === 0
        ? 'Escolha ao menos uma métrica secundária.'
        : 'Há métrica secundária que não existe no catálogo.',
    ),
    check(
      'primaria_fora_das_secundarias',
      'A primária não se repete nas secundárias',
      !d.secondaryMetricIds.includes(d.primaryMetricId),
      'Remova a métrica primária da lista de secundárias.',
    ),
    check(
      'mde',
      'Efeito mínimo detectável definido',
      Number.isFinite(d.mdeRelative) && d.mdeRelative > 0 && d.mdeRelative < 1,
      'Defina o efeito mínimo detectável (maior que 0% e menor que 100%).',
    ),
    check(
      'midia_variantes',
      'Cada variante com Figma ou print',
      mediaOk,
      'Cole o link do Figma ou anexe um print em cada variante — um dos dois é obrigatório.',
    ),
    check(
      'figma',
      'Links do Figma válidos',
      figmaUrls.every(isFigmaUrl),
      'Use um link do Figma (https://www.figma.com/…) ou deixe o campo vazio.',
    ),
  ];

  const done = checks.filter((c) => c.ok).length;
  return { complete: done === checks.length, checks, done, total: checks.length };
}
