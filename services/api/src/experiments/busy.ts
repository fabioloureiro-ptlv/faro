// Testes que ocupam a mesma página de um experimento novo, para a sugestão de datas.
// Só entram dois grupos: o que o Acompanhamento mostra na DY (inclusive os FARO-0000-…, que o
// Faro não cadastrou mas que disputam o mesmo tráfego) e os experimentos do Faro em andamento,
// que já têm datas programadas. Cada um sai com o status "Na DY" ou "Em design".
import type { Experiment, ExperimentStatus } from '@faro/contracts';
import { addDays, type BusyWindow } from '@faro/config-core';
import { DY_PSEUDO_PREFIX } from '../painel/dataset.ts';

/** Experimento do Faro já configurado ou rodando na DY: aparece no Acompanhamento como teste da DY. */
const NA_DY: ExperimentStatus[] = ['configurado_no_dy', 'rodando'];
/** Experimento do Faro ainda sendo desenhado: alguém está programando algo para essas datas. */
const EM_DESIGN: ExperimentStatus[] = ['rascunho', 'design_completo', 'pronto_para_configurar'];

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
  /** Último dia com dados da DY (D-1). */
  asOf: string;
}): BusyResult {
  const { pages, asOf } = input;
  const busy: BusyWindow[] = [];
  let considerados = 0;
  let semPagina = 0;

  for (const o of input.experiments) {
    if (o.faroId === input.faroId || !o.allocation.startDate || !o.allocation.endDate) continue;
    const dy = o.faroId.startsWith(DY_PSEUDO_PREFIX);
    const samePage = o.allocation.pages.some((p) => pages.includes(p));

    if (!dy) {
      const status = NA_DY.includes(o.status) ? 'na_dy' : EM_DESIGN.includes(o.status) ? 'em_design' : null;
      if (status && samePage) busy.push({ faroId: o.faroId, name: o.name, startDate: o.allocation.startDate, endDate: o.allocation.endDate, status });
      continue;
    }

    // Teste da DY: só conta se ainda está rodando (exposição até o último dia de dados).
    if (o.allocation.endDate < asOf) continue;
    if (!o.allocation.pages.length) {
      semPagina += 1;
      continue;
    }
    if (!samePage) continue;
    considerados += 1;
    busy.push({
      faroId: o.faroId,
      name: o.name,
      startDate: o.allocation.startDate,
      endDate: addDays(asOf, DY_ASSUMED_REMAINING_DAYS),
      status: 'na_dy',
      endEstimated: true,
    });
  }
  return { busy, dy: { considerados, semPagina, asOf } };
}
