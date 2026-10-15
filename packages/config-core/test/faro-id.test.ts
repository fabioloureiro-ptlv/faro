import { describe, expect, it } from 'vitest';
import { formatFaroId, parseFaroId } from '../src/index.ts';

describe('faroId (CFG-10)', () => {
  it('formata FARO-AAAA-NNNN', () => {
    expect(formatFaroId(2026, 42)).toBe('FARO-2026-0042');
    expect(parseFaroId('FARO-2026-0042')).toEqual({ year: 2026, seq: 42 });
    expect(parseFaroId('FARO-26-42')).toBeNull();
  });
  it('rejeita sequência fora do intervalo', () => {
    expect(() => formatFaroId(2026, 0)).toThrow();
    expect(() => formatFaroId(2026, 10000)).toThrow();
  });
});
