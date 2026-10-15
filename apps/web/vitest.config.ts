import { defineProject } from 'vitest/config';

// Testes de domínio das layers (funções puras em features/*/app/domain); componentes Vue ficam fora.
export default defineProject({
  root: import.meta.dirname,
  test: { name: 'web', include: ['features/*/app/**/*.test.ts'] },
});
