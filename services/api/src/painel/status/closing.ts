import { HttpsUrlSchema } from '@faro/contracts';
import type { DyCampaignStatus, Experiment } from '@faro/contracts';

// PNL-10: checklist de encerramento. Os três itens precisam estar ok para ir a `encerrado`.

export type ClosingItemId = 'decisao' | 'dy_desligado' | 'aprendizado';

export interface ClosingItem {
  id: ClosingItemId;
  label: string;
  done: boolean;
  detail: string;
}

export interface ClosingChecklist {
  items: ClosingItem[];
  ready: boolean;
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Desligamento só conta quando o export confirma: campanha inativa e nenhuma exposição
 * depois do dia da decisão, num export de data posterior à decisão (D+1).
 */
function dyOff(exp: Experiment, campaign: DyCampaignStatus | undefined): Omit<ClosingItem, 'id' | 'label'> {
  const decidedAt = exp.decision?.decidedAt.slice(0, 10);
  if (!decidedAt) return { done: false, detail: 'Registre a decisão primeiro.' };
  if (!campaign) return { done: false, detail: 'Nenhuma campanha do DY com o label deste teste no export.' };
  if (campaign.asOf.slice(0, 10) <= decidedAt) {
    return { done: false, detail: 'Aguardando o export do dia seguinte à decisão.' };
  }
  const last = campaign.lastExposureDate;
  if (last && last > decidedAt) {
    return { done: false, detail: `Ainda com exposição no DY em ${dm(last)}.` };
  }
  if (campaign.active) return { done: false, detail: 'Campanha ainda ativa no DY.' };
  return {
    done: true,
    detail: `Sem exposição desde ${last ? dm(last) : 'a decisão'} (export de ${dm(campaign.asOf)}).`,
  };
}

export function closingChecklist(
  exp: Experiment,
  campaign: DyCampaignStatus | undefined,
  learningUrl: string | undefined = exp.decision?.learningUrl,
): ClosingChecklist {
  const validUrl = learningUrl !== undefined && HttpsUrlSchema.safeParse(learningUrl).success;
  const items: ClosingItem[] = [
    {
      id: 'decisao',
      label: 'Decisão registrada',
      done: !!exp.decision,
      detail: exp.decision ? `${exp.decision.decidedBy} em ${dm(exp.decision.decidedAt)}` : 'Sem decisão.',
    },
    { id: 'dy_desligado', label: 'Campanha desligada no DY', ...dyOff(exp, campaign) },
    {
      id: 'aprendizado',
      label: 'Aprendizado publicado',
      done: validUrl,
      detail: validUrl
        ? 'Link registrado.'
        : learningUrl
          ? 'O link precisa começar com https://.'
          : 'Informe o link do aprendizado publicado.',
    },
  ];
  return { items, ready: items.every((i) => i.done) };
}
