// CLI: npm run job:dy-consistency -- --refdate=AAAA-MM-DD (padrão: ontem, D-1).
import { parseArgs } from 'node:util';
import { defaultPorts } from '../app.ts';
import { createDb } from '../db/client.ts';
import { runConsistency } from './run-consistency.ts';

const { values } = parseArgs({ options: { refdate: { type: 'string' } } });
const refdate = values.refdate ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const dataDir = process.env.FARO_DATA_DIR ?? new URL('../../.data/pglite', import.meta.url).pathname;
const { db, close } = await createDb(dataDir);
const run = await runConsistency(db, defaultPorts(db), refdate);
console.log(JSON.stringify({ ...run, divergences: run.divergences.length }, null, 2));
for (const d of run.divergences) console.log(`- ${d.faroId} [${d.kind}] ${d.message}`);
await close();
