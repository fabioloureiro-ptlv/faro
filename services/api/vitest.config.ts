import { join } from 'node:path';
import { defineProject } from 'vitest/config';

// Os testes da API são herméticos: apontam para caminhos inexistentes e nunca leem o que o
// `.data/` guarda na máquina de quem roda (export da DY, resultados reais, segmentos importados).
// O catálogo de segmentos dos testes é a fixture dos contratos (vários segmentos), não o catálogo
// oficial do app (data/models/audiences/catalog.json), que tem só os segmentos de produção.
export default defineProject({
  root: import.meta.dirname,
  test: {
    name: 'api',
    testTimeout: 20000,
    env: {
      FARO_RESULTS_PATH: '/faro-teste/sem-results.json',
      FARO_DY_EXPORT_PATH: '/faro-teste/sem-dy-campaigns.json',
      FARO_AUDIENCES_CUSTOM_PATH: '/faro-teste/sem-audiences-custom.json',
      FARO_AUDIENCES_CATALOG_PATH: join(import.meta.dirname, '../../packages/contracts/fixtures/audiences.json'),
    },
  },
});
