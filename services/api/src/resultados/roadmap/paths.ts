// E8 — caminhos do repositório usados pela fonte roadmap. Um lugar só, para a API, o job e os testes.
import { fileURLToPath } from 'node:url';

/** Raiz do monorepo (services/api/src/resultados/roadmap → ../../../../). */
export const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** Saída do job interino `npm run job:sync-results` (só a consulta de resultados, cadastro do roadmap). */
export const RESULTS_PATH = fileURLToPath(new URL('../../../.data/results.json', import.meta.url));

/** Snapshots do `npm run job:sync-roadmap` (três consultas, cadastro do Faro). Gitignored. */
export const SNAPSHOT_DIR = 'data/snapshots/roadmap';

/** Templates das consultas: results é a versionada em data/models; discovery e daily vão em data/queries/roadmap. */
export const QUERY_FILES = {
  results: 'data/models/results/dy_results.sql',
  discovery: 'data/queries/roadmap/dy_discovery.sql',
  daily: 'data/queries/roadmap/dy_daily_v3.sql',
} as const;
