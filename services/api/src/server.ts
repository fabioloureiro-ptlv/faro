import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp, defaultPorts } from './app.ts';
import { createDb } from './db/client.ts';
import { seedFixtures } from './seed.ts';

const port = Number(process.env.FARO_API_PORT ?? 4000);
// fileURLToPath, não .pathname: no Windows o pathname vira "/C:/..." e quebra o mkdir.
const dataDir = process.env.FARO_DATA_DIR ?? fileURLToPath(new URL('../.data/pglite', import.meta.url));
mkdirSync(dataDir, { recursive: true });

const { db } = await createDb(dataDir);
const seeded = await seedFixtures(db);
const app = await buildApp(db, defaultPorts(db), {
  logger: true,
  corsOrigin: (process.env.FARO_WEB_ORIGIN ?? 'http://localhost:3000').split(','),
});
if (seeded) app.log.info(`${seeded} experimentos de fixture carregados`);
await app.listen({ port, host: '127.0.0.1' });
