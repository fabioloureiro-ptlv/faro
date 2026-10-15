// Testes que ocupam a mesma página e plataforma de um experimento novo, para a sugestão de datas.
// Junta os experimentos cadastrados no Faro e os testes ativos que o Acompanhamento lê da DY
// (FARO-0000-…), que o Faro não cadastrou mas que disputam o mesmo tráfego.
import type { Experiment, ExperimentStatus } from '@faro/contracts';
import { addDays, type BusyWindow } from '@faro/config-core';
import { DY_PSEUDO_PREFIX } from '../painel/dataset.ts';

const DY_LINKED: ExperimentStatus[] = ['pronto_para_configurar', 'configurado_no_dy', 'rodando', 'decidido'];

/**
 * DECISAO-PENDENTE: o export da DY só mostra atividade observada, sem data de fim planejada. Um teste da DY
 * com exposição no último dia de dados é tratado como ainda rodando e ocupando mais estes dias.
 */
export const DY_ASSUMED_REMAINING_DAYS = 14;

export interface BusyResult {
  busy: BusyWindow[];
  /** O que veio da DY: quantos testes ativos entraram na conta e quantos ficaram de fora por não terem página identificada. */
  dy: { considerados: number; semPagina: number; asOf: string };
}

export function busyWindows(input: {
  experiments: Experiment[];
  /** Experimento que está sendo planejado (fica de fora). */
  faroId: string;
  pages: string[];
  platforms: Experiment['allocation']['platforms'];
  /** Último dia com dados da DY (D-1). */
  asOf: string;
}): BusyResult {
  const { pages, platforms, asOf } = input;
  const busy: BusyWindow[] = [];
  let considerados = 0;
  let semPagina = 0;

  for (const o of input.experiments) {
    if (o.faroId === input.faroId || !o.allocation.startDate || !o.allocation.endDate) continue;
    const dy = o.faroId.startsWith(DY_PSEUDO_PREFIX);
    const platformMatch = o.allocation.platforms.some((p) => platforms.includes(p));

    if (!dy) {
      if (DY_LINKED.includes(o.status) && platformMatch && o.allocation.pages.some((p) => pages.includes(p)))
        busy.push({ faroId: o.faroId, name: o.name, startDate: o.allocation.startDate, endDate: o.allocation.endDate, source: 'faro' });
      continue;
    }

    // Teste da DY: só conta se ainda está rodando (exposição até o último dia de dados).
    if (o.allocation.endDate < asOf) continue;
    if (!o.allocation.pages.length) {
      if (platformMatch) semPagina += 1;
      continue;
    }
    if (!platformMatch || !o.allocation.pages.some((p) => pages.includes(p))) continue;
    considerados += 1;
    busy.push({
      faroId: o.faroId,
      name: o.name,
      startDate: o.allocation.startDate,
      endDate: addDays(asOf, DY_ASSUMED_REMAINING_DAYS),
      source: 'dy',
      endEstimated: true,
    });
  }
  return { busy, dy: { considerados, semPagina, asOf } };
}
