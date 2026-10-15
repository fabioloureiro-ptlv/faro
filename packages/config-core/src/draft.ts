// Rascunhos: experimento em branco, a partir de template (frente 5) e duplicação (CFG-15).
import type { Experiment, Template } from '@faro/contracts';

export type DraftFields = Omit<Experiment, 'faroId' | 'status' | 'createdAt' | 'updatedAt'>;

export function blankDraft(owner: { ownerEmail: string; ownerSquad?: string }): DraftFields {
  return {
    name: '',
    bu: 'ecom',
    ownerSquad: owner.ownerSquad ?? '',
    ownerEmail: owner.ownerEmail,
    design: {
      context: '',
      hypothesis: { change: '', expectedEffect: '', because: '' },
      control: { name: 'Controle', description: '' },
      variants: [{ key: 'a', name: 'Variante A', description: '' }],
      primaryMetricId: '',
      secondaryMetricIds: [],
      guardrailMetricIds: [],
      mdeRelative: 0.05,
    },
    audience: { description: 'Todos os clientes', source: 'atalho', estimatedShare: 1 },
    allocation: {
      platforms: ['site', 'android', 'ios'],
      pages: [],
      trafficPercent: 50,
      split: [0.5, 0.5],
      startDate: '',
      endDate: '',
    },
    legacy: false,
  };
}

export function draftFromTemplate(template: Template, owner: { ownerEmail: string; ownerSquad?: string }): DraftFields {
  const base = blankDraft(owner);
  return {
    ...base,
    ...(template.bu ? { bu: template.bu } : {}),
    templateId: template.id,
    design: { ...base.design, ...template.design },
    allocation: { ...base.allocation, ...template.allocation },
  };
}

/** Novo rascunho a partir de outro experimento: limpa datas, IDs do DY, decisão e sobreposição. */
export function duplicateDraft(source: Experiment, owner: { ownerEmail: string }): DraftFields {
  const copy = structuredClone(source);
  return {
    name: `${copy.name} (cópia)`,
    bu: copy.bu,
    ownerSquad: copy.ownerSquad,
    ownerEmail: owner.ownerEmail,
    ...(copy.templateId ? { templateId: copy.templateId } : {}),
    design: copy.design,
    audience: copy.audience,
    allocation: { ...copy.allocation, startDate: '', endDate: '' },
    legacy: false,
  };
}
