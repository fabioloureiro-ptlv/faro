import { describe, expect, it } from 'vitest';
import type { AudienceRule, AudienceShortcut } from '@faro/contracts';
import { BASE_CLIENTES, planImport, verifySqlSegments } from './import.ts';
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

const SQL_OK = `SELECT c.chv_cliente, c.public_id AS cuid
FROM \`petlove-dataeng-prod-01.dw_corporativo.dim_cliente\` c
WHERE c.public_id IS NOT NULL AND c.fl_plano_ativo_saude = 1`;

describe('importação de SQL livre', () => {
  it('guarda o SQL no atalho e exige a volumetria', () => {
    const plan = planImport([{ name: 'Inadimplentes há mais de 60 dias', sql: SQL_OK, clientes: 4200 }], existing);
    expect(plan.ignorados).toEqual([]);
    expect(plan.novos[0]).toMatchObject({ id: 'inadimplentes-ha-mais-de-60-dias', sql: SQL_OK });
    expect(plan.novos[0]?.rule).toBeUndefined();

    const semVolumetria = planImport([{ name: 'Inadimplentes há mais de 60 dias', sql: SQL_OK }], existing);
    expect(semVolumetria.ignorados[0]?.motivo).toBe('formato_invalido');
  });

  it('com regra e SQL no mesmo item, vale a regra (SQL regenerado)', () => {
    const plan = planImport([{ name: 'Regra e SQL juntos', rule: rule(['racao']), sql: 'SELECT 1', clientes: 10 }], existing);
    expect(plan.novos[0]?.sql).toBeUndefined();
    expect(plan.novos[0]?.rule).toBeDefined();
  });

  it('barra comando que escreve, vários comandos e query sem cuid', () => {
    const casos: [string, RegExp][] = [
      ['DELETE FROM `x.y.z` WHERE true', /SELECT ou WITH/],
      [`${SQL_OK}; DROP TABLE x`, /um comando/],
      ['SELECT cuid FROM t WHERE 1=1 AND (SELECT 1 FROM u) IN (SELECT 1) UNION ALL SELECT cuid FROM (DROP TABLE a)', /DROP/],
      ['SELECT chv_cliente FROM `p.d.t`', /cuid/],
    ];
    for (const [sql, msg] of casos) {
      const plan = planImport([{ name: 'Segmento de teste', sql, clientes: 1 }], []);
      expect(plan.novos).toEqual([]);
      expect(plan.ignorados[0]?.detalhe).toMatch(msg);
    }
  });

  it('palavra-chave dentro de string, comentário ou nome de coluna não conta', () => {
    const sql = `-- cria lista de update
SELECT public_id AS cuid, 'drop table' AS nota, dt_update, \`p.d.create_log\`
FROM \`p.d.t\``;
    expect(planImport([{ name: 'Segmento com palavras', sql, clientes: 1 }], []).ignorados).toEqual([]);
  });

  it('o dry run recusa query sem cuid ou que não compila', async () => {
    const plan = planImport(
      [
        { name: 'Com cuid certinho', sql: SQL_OK, clientes: 10 },
        { name: 'Sem cuid no resultado', sql: 'SELECT chv_cliente, public_id AS cuid FROM t', clientes: 10 },
        { name: 'Que nao compila nada', sql: 'SELECT cuid FROM tabela_que_nao_existe', clientes: 10 },
      ],
      [],
    );
    const dryRun = async (sql: string) => {
      if (sql.includes('tabela_que_nao_existe')) throw new Error('Not found: Table');
      return sql.includes('chv_cliente, public_id') ? ['chv_cliente', 'id'] : ['chv_cliente', 'cuid'];
    };
    const out = await verifySqlSegments(plan, dryRun);
    expect(out.novos.map((s) => s.name)).toEqual(['Com cuid certinho']);
    expect(out.ignorados.map((i) => i.motivo)).toEqual(['sql_invalido', 'sql_invalido']);
    expect(out.ignorados[0]?.detalhe).toMatch(/não devolve a coluna cuid/);
    expect(out.ignorados[1]?.detalhe).toMatch(/BigQuery recusou/);
  });
});

describe('escape de valores no SQL gerado', () => {
  it('barra invertida não deixa o valor fechar o literal', () => {
    const sql = audienceRuleToSql(rule(["x\\' OR 1=1 --"]));
    expect(sql).toContain("LIKE '%x\\\\\\' or 1=1 --%'");
    expect(sql).not.toContain("x\\' or 1=1");
  });
});
