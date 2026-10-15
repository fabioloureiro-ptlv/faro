import { describe, expect, it } from 'vitest';
import { ExperimentSchema } from '@faro/contracts';
import fixtures from '@faro/contracts/fixtures/experiments.json';
import { missingDesignFields } from './design.ts';

const byId = (id: string) => ExperimentSchema.parse(fixtures.items.find((e) => e.faroId === id));

describe('missingDesignFields', () => {
  it('design completo não tem pendência', () => {
    expect(missingDesignFields(byId('FARO-2026-0002').design)).toEqual([]);
  });

  it('Nexus (legado) aponta motivo da hipótese e descrições vazias', () => {
    expect(missingDesignFields(byId('FARO-2026-0001').design)).toEqual([
      'hypothesis.because',
      'control.description',
      'variants.description',
    ]);
  });

  it('rascunho aponta efeito esperado e motivo', () => {
    expect(missingDesignFields(byId('FARO-2026-0009').design)).toEqual([
      'hypothesis.expectedEffect',
      'hypothesis.because',
      'variants.description',
    ]);
  });

  it('só espaços conta como vazio', () => {
    const d = byId('FARO-2026-0002').design;
    expect(missingDesignFields({ ...d, context: '   ' })).toEqual(['context']);
  });
});
