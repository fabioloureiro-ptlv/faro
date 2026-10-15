import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { privacyViolations } from '../src/resultados/roadmap/privacy.ts';
import { REPO_ROOT, SNAPSHOT_DIR } from '../src/resultados/roadmap/paths.ts';
import { dadosAte } from '../src/resultados/roadmap/snapshot.ts';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>[];

describe('snapshots sem identificador de usuário ou sessão (E8)', () => {
  it('detecta coluna de identificador e valor que parece e-mail', () => {
    expect(privacyViolations([{ campanha: 'x', dyid: '1' }])).toEqual(['dyid: coluna de identificador']);
    expect(privacyViolations([{ campanha: 'x', obs: 'fulano@example.com' }])).toEqual(['obs: valor parece e-mail']);
    expect(privacyViolations([{ campanha: 'x', unidades: 10, variacao: 'a' }])).toEqual([]);
  });

  it('fixture sintética da API passa', () => {
    const dir = resolve(REPO_ROOT, 'services/api/test/fixtures/roadmap');
    for (const f of ['results', 'discovery', 'daily']) expect(privacyViolations(read(resolve(dir, `${f}.json`)), `${f}.`)).toEqual([]);
  });

  const latest = resolve(REPO_ROOT, SNAPSHOT_DIR, 'latest.json');
  it.skipIf(!existsSync(latest))('snapshot real (latest.json) passa', () => {
    const meta = JSON.parse(readFileSync(latest, 'utf8')) as { dir: string };
    for (const f of ['results', 'discovery', 'daily'])
      expect(privacyViolations(read(resolve(REPO_ROOT, SNAPSHOT_DIR, meta.dir, `${f}.json`)), `${f}.`)).toEqual([]);
  });

  it('dados_ate = maior data_fim_leitura; sem resultado, D-1', () => {
    expect(dadosAte([{ data_fim_leitura: '2026-10-12' }, { data_fim_leitura: '2026-10-13' }])).toBe('2026-10-13');
    expect(dadosAte([], new Date('2026-10-15T12:00:00Z'))).toBe('2026-10-14');
  });
});
