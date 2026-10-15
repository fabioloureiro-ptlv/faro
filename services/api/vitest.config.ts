import { defineProject } from 'vitest/config';

// Os testes da API são herméticos: apontam para caminhos inexistentes e nunca leem o que o
// `.data/` guarda na máquina de quem roda (export da DY, resultados reais, segmentos importados).
export default defineProject({
  root: import.meta.dirname,
  test: {
    name: 'api',
    testTimeout: 20000,
    env: {
      FARO_RESULTS_PATH: '/faro-teste/sem-results.json',
      FARO_DY_EXPORT_PATH: '/faro-teste/sem-dy-campaigns.json',
      FARO_AUDIENCES_CUSTOM_PATH: '/faro-teste/sem-audiences-custom.json',
    },
  },
});
