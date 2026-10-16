// Avisa o time pelo terminal, sem passar pela tela:
//   npm run job:anuncio -- FARO-2026-0001            # envia (Slack e/ou Jira conforme o .env)
//   npm run job:anuncio -- FARO-2026-0001 --dry-run  # só mostra a mensagem e quem seria marcado
// Usa o mesmo banco local da API (services/api/.data/pglite): pare a API antes de rodar.
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildApp, defaultPorts } from '../../app.ts';
import { createDb } from '../../db/client.ts';
import { createExperimentService } from '../../experiments/service.ts';
import { anunciarExperimento } from '../service.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'dry-run': { type: 'boolean', default: false } },
});
const faroId = positionals[0];
if (!faroId) {
  console.error('uso: npm run job:anuncio -- <faroId> [--dry-run]');
  process.exit(2);
}
const dataDir =
  process.env.FARO_DATA_DIR ?? fileURLToPath(new URL('../../../.data/pglite', import.meta.url));
const { db, close } = await createDb(dataDir);
try {
  const ports = defaultPorts(db);
  const app = await buildApp(db, ports);
  const svc = createExperimentService(db, ports);
  const r = await anunciarExperimento(
    { svc, db, ports, log: (m) => console.warn(m) },
    faroId,
    process.env.FARO_USER ?? 'cli@faro',
    { dryRun: values['dry-run'] },
  );
  console.log(values['dry-run'] ? '--- mensagem (não enviada) ---' : '--- mensagem ---');
  console.log(r.texto);
  console.log(`--- marcados: ${r.mencoes.join(', ') || 'ninguém'}`);
  console.log(
    `--- slack: ${r.slack.status}${r.slack.channel ? ` (${r.slack.channel})` : ''} · jira: ${r.jira.status}${r.jira.url ? ` (${r.jira.url})` : ''}`,
  );
  await app.close();
} finally {
  await close();
}
