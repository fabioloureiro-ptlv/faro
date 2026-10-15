import { describe, expect, it } from 'vitest';
import { AudienceParameterSchema, audienceAttributeFor, defaultAudienceParams, resolveAudienceParams } from '../src/index.ts';

const dias = AudienceParameterSchema.parse({
  name: 'dias_inadimplencia',
  label: 'Dias de inadimplência (mais de)',
  type: 'integer',
  default: 60,
  min: 1,
  max: 1825,
  unit: 'dias',
});

describe('parâmetros de segmento', () => {
  it('usa o padrão quando nada é informado', () => {
    expect(defaultAudienceParams([dias])).toEqual({ dias_inadimplencia: 60 });
    expect(resolveAudienceParams([dias])).toEqual({ ok: true, values: { dias_inadimplencia: 60 } });
    expect(resolveAudienceParams(undefined)).toEqual({ ok: true, values: {} });
  });

  it('aceita número e texto numérico (query string)', () => {
    expect(resolveAudienceParams([dias], { dias_inadimplencia: 90 })).toEqual({ ok: true, values: { dias_inadimplencia: 90 } });
    expect(resolveAudienceParams([dias], { dias_inadimplencia: '120' })).toEqual({ ok: true, values: { dias_inadimplencia: 120 } });
    expect(resolveAudienceParams([dias], { dias_inadimplencia: '' })).toEqual({ ok: true, values: { dias_inadimplencia: 60 } });
  });

  it('recusa nome desconhecido, texto, decimal em inteiro e fora do intervalo', () => {
    const msg = (p: Record<string, unknown>) => {
      const r = resolveAudienceParams([dias], p);
      return r.ok ? '' : r.message;
    };
    expect(msg({ outro: 1 })).toMatch(/desconhecido/);
    expect(msg({ dias_inadimplencia: 'abc' })).toMatch(/número/);
    expect(msg({ dias_inadimplencia: 30.5 })).toMatch(/inteiro/);
    expect(msg({ dias_inadimplencia: 0 })).toMatch(/mínimo é 1/);
    expect(msg({ dias_inadimplencia: 5000 })).toMatch(/máximo é 1825/);
    expect(msg({ dias_inadimplencia: null })).toMatch(/número/);
  });

  it('o atributo no DY muda com o valor do parâmetro', () => {
    expect(audienceAttributeFor('faro_aud_inadimplentes', [dias], { dias_inadimplencia: 60 })).toBe('faro_aud_inadimplentes_60');
    expect(audienceAttributeFor('faro_aud_inadimplentes', [dias], { dias_inadimplencia: 90 })).toBe('faro_aud_inadimplentes_90');
    expect(audienceAttributeFor('faro_publico_todos', undefined, {})).toBe('faro_publico_todos');
    expect(audienceAttributeFor(undefined, [dias], {})).toBeUndefined();
  });
});
