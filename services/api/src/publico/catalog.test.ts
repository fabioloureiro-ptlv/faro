import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AudienceShortcutSchema, audienceAttributeFor, resolveAudienceParams } from '@faro/contracts';

// Valida o catálogo oficial do app (data/models/audiences/catalog.json), que os testes da API não usam.
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const catalog = (JSON.parse(readFileSync(join(REPO_ROOT, 'data/models/audiences/catalog.json'), 'utf-8')) as unknown[]).map((s) =>
  AudienceShortcutSchema.parse(s),
);

describe('catálogo oficial de segmentos', () => {
  it('começa com "Todos os clientes" (sem query) e "Clientes inadimplentes"', () => {
    expect(catalog.map((s) => s.id)).toEqual(['todos', 'inadimplentes']);
    const todos = catalog[0]!;
    expect(todos).toMatchObject({ share: 1 });
    expect(todos.sqlRef ?? todos.sql ?? todos.rule).toBeUndefined();
  });

  it('todo segmento com query aponta para um .sql que existe e usa cada parâmetro declarado', () => {
    for (const s of catalog.filter((x) => x.sqlRef)) {
      const sql = readFileSync(join(REPO_ROOT, s.sqlRef!), 'utf-8');
      for (const p of s.parameters ?? []) expect(sql, `${s.id} usa @${p.name}`).toContain(`@${p.name}`);
      expect(sql).toMatch(/\bcuid\b/);
      // Nenhum parâmetro não declarado.
      const usados = [...sql.matchAll(/@([a-z][a-z0-9_]*)/g)].map((m) => m[1]);
      for (const nome of new Set(usados)) expect(s.parameters?.some((p) => p.name === nome), `${s.id}: @${nome} declarado`).toBe(true);
    }
  });

  it('inadimplentes: dias de inadimplência é o parâmetro, com padrão 60 e atributo por valor no DY', () => {
    const s = catalog.find((x) => x.id === 'inadimplentes')!;
    expect(s.parameters).toHaveLength(1);
    expect(s.parameters![0]).toMatchObject({ name: 'dias_inadimplencia', type: 'integer', default: 60 });
    const r = resolveAudienceParams(s.parameters);
    expect(r).toEqual({ ok: true, values: { dias_inadimplencia: 60 } });
    expect(audienceAttributeFor(s.dyAttribute, s.parameters, { dias_inadimplencia: 90 })).toBe('faro_aud_inadimplentes_90');
  });
});
