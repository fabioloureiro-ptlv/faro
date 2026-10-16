import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp, defaultPorts } from './app.ts';
import { createDb, createMysqlDb, mysqlConfigFromEnv } from './db/client.ts';
import { seedFixtures } from './seed.ts';

const port = Number(process.env.FARO_API_PORT ?? 4000);
// fileURLToPath, não .pathname: no Windows o pathname vira "/C:/..." e quebra o mkdir.
const dataDir = process.env.FARO_DATA_DIR ?? fileURLToPath(new URL('../.data/pglite', import.meta.url));

// O PGlite em disco pode se recusar a abrir ("failed to initialize") depois que o processo é morto à
// força (dev com --watch, parar o servidor), mesmo com os dados íntegros: sobra o `postmaster.pid` da
// execução anterior e, às vezes, a pasta só abre depois de copiada. Por isso, nesta ordem:
//   1. abre no lugar, sem a trava velha;
//   2. se falhar, abre uma CÓPIA da pasta e, se a cópia abrir, ela passa a ser o banco (a original
//      fica guardada em *-corrompido-*), sem perder os rascunhos locais;
//   3. só se a cópia também não abrir, guarda a pasta e recria das fixtures.
const agora = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14);

async function abrir(dir: string) {
  rmSync(`${dir}/postmaster.pid`, { force: true });
  return createDb(dir);
}

async function openDb() {
  // MySQL gerenciado (Cloud SQL via IAM, ou FARO_MYSQL_URL) quando configurado:
  // persistência real entre instâncias e ~300 MB a menos de memória que o PGlite.
  const mysqlCfg = mysqlConfigFromEnv();
  if (mysqlCfg) return createMysqlDb(mysqlCfg);

  mkdirSync(dataDir, { recursive: true });
  try {
    return await abrir(dataDir);
  } catch (e) {
    console.warn(`Banco local não abriu (${(e as Error).message}). Tentando uma cópia da pasta.`);
  }

  const copia = `${dataDir}-copia`;
  const aside = `${dataDir}-corrompido-${agora()}`;
  rmSync(copia, { recursive: true, force: true });
  try {
    cpSync(dataDir, copia, { recursive: true });
    const teste = await abrir(copia);
    await teste.close();
    renameSync(dataDir, aside);
    renameSync(copia, dataDir);
    console.warn(`Banco recuperado a partir de uma cópia; a pasta original ficou em ${aside}.`);
    return await abrir(dataDir);
  } catch (e) {
    console.warn(`A cópia também não abriu (${(e as Error).message}). Guardando em ${aside} e recriando das fixtures; rascunhos locais ficam na pasta guardada.`);
    rmSync(copia, { recursive: true, force: true });
    if (existsSync(dataDir)) renameSync(dataDir, aside);
    mkdirSync(dataDir, { recursive: true });
    return await abrir(dataDir);
  }
}

const { db } = await openDb();
const seeded = await seedFixtures(db);
const app = await buildApp(db, defaultPorts(db), {
  logger: true,
  corsOrigin: (process.env.FARO_WEB_ORIGIN ?? 'http://localhost:3000').split(','),
});
if (seeded) app.log.info(`${seeded} experimentos de fixture carregados`);
await app.listen({ port, host: '127.0.0.1' });
