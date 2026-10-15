import { describe, expect, it } from 'vitest';
import type { AudienceRule, AudienceShortcut } from '@faro/contracts';
import { BASE_CLIENTES, planImport } from './import.ts';
import { audienceRuleToSql } from './rule-sql.ts';

const rule = (values: string[]): AudienceRule => ({
  op: 'and',
  conditions: [{ type: 'comprou', dimension: 'categoria', values, windowDays: 180 }],
});
const existing: AudienceShortcut[] = [{ id: 'caes', name: 'Tutores de cães', share: 0.68, dyAttribute: 'faro_publico_caes' }];

describe('importação de segmentos do artefato', () => {
  it('importa regra válida, deriva id, atributo DY e participação da volumetria', () => {
    const plan = planImport([{ name: 'Compradores de ração (6 meses)', rule: rule(['racao']), clientes: 152_705 }], existing);
    expect(plan.ignorados).toEqual([]);
    expect(plan.novos).toHaveLength(1);
    expect(plan.novos[0]).toMatchObject({
      id: 'compradores-de-racao-6-meses',
      dyAttribute: 'faro_aud_compradores_de_racao_6_meses',
      share: Math.round((152_705 / BASE_CLIENTES) * 10000) / 10000,
    });
  });

  it('id truncado não termina em hífen', () => {
    const plan = planImport([{ name: 'Assinantes do Clube que compraram antipulgas (12 meses)', rule: rule(['antipulgas']) }], []);
    expect(plan.novos[0]?.id).toBe('assinantes-do-clube-que-compraram-antipulgas-12');
  });

  it('ignora nome repetido (do catálogo ou do próprio lote) sem derrubar o resto', () => {
    const plan = planImport(
      [
        { name: 'tutores de cães', rule: rule(['x']) },
        { name: 'Compradores de areia nova', rule: rule(['areia']) },
        { name: 'Compradores de areia nova', rule: rule(['areia']) },
      ],
      existing,
    );
    expect(plan.novos.map((s) => s.id)).toEqual(['compradores-de-areia-nova']);
    expect(plan.ignorados.map((i) => i.motivo)).toEqual(['ja_existe', 'ja_existe']);
  });

  it('rejeita formato inválido e regra que o gerador de SQL não suporta', () => {
    const plan = planImport(
      [
        { name: 'ab', rule: rule(['x']) },
        { name: 'Região sudeste ativa', rule: { op: 'and', conditions: [{ type: 'propriedade', key: 'regiao', op: 'eq', values: ['sp'] }] } },
      ],
      existing,
    );
    expect(plan.novos).toEqual([]);
    expect(plan.ignorados.map((i) => i.motivo)).toEqual(['formato_invalido', 'regra_nao_suportada']);
  });
});

describe('escape de valores no SQL gerado', () => {
  it('barra invertida não deixa o valor fechar o literal', () => {
    const sql = audienceRuleToSql(rule(["x\\' OR 1=1 --"]));
    expect(sql).toContain("LIKE '%x\\\\\\' or 1=1 --%'");
    expect(sql).not.toContain("x\\' or 1=1");
  });
});
