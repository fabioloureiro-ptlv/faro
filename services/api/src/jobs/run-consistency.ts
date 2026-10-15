// Checagem D+1 (CFG-13): compara o export do DY com o planejado e emite divergências.
import { checkConsistency } from '@faro/config-core';
import type { ConfigDivergence, ExperimentStatus } from '@faro/contracts';
import type { Db } from '../db/client.ts';
import { appendEvent, listExperiments } from '../experiments/repository.ts';
import type { Ports } from '../ports.ts';

const CHECKED: ExperimentStatus[] = ['configurado_no_dy', 'rodando', 'decidido'];

export interface ConsistencyRun {
  refdate: string;
  checked: number;
  withoutData: string[];
  divergences: ConfigDivergence[];
}

export async function runConsistency(db: Db, ports: Ports, refdate: string): Promise<ConsistencyRun> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(refdate)) throw new Error('refdate no formato AAAA-MM-DD');
  const targets = (await listExperiments(db)).filter((e) => CHECKED.includes(e.status) && e.dy?.campaignId);
  const run: ConsistencyRun = { refdate, checked: 0, withoutData: [], divergences: [] };
  for (const exp of targets) {
    const snap = await ports.dyExport.getSnapshot(exp.dy!.campaignId!, refdate);
    if (!snap) {
      run.withoutData.push(exp.faroId);
      continue;
    }
    run.checked++;
    const divs = checkConsistency(exp, snap);
    if (divs.length) {
      run.divergences.push(...divs);
      await appendEvent(db, {
        type: 'experiment.config_divergence',
        faroId: exp.faroId,
        actor: 'job:dy-consistency',
        occurredAt: ports.now().toISOString(),
        payload: { divergences: divs },
      });
    }
  }
  return run;
}
