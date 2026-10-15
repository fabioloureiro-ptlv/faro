import { describe, expect, it } from 'vitest';
import type { AudienceShortcut } from '@faro/contracts';
import { BASE_CLIENTES } from './import.ts';
import { checkPackage, usedParameters, type PackageRunner } from './package.ts';

const SQL = [
  '-- Parâmetro: @dias_sem_compra INT64 (padrão 180)',
  'SELECT public_id AS cuid, chv_cliente',
  'FROM `petlove-dataeng-prod-01.dw_corporativo.dim_cliente`',
  'WHERE public_id IS NOT NULL AND dt_ultima_compra < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @dias_sem_compra DAY)',
];
const DIAS = { name: 'dias_sem_compra', label: 'Dias sem compra (mais de)', type: 'integer', default: 180, min: 1, max: 1825, unit: 'dias' };
const pacote = (over: Record<string, unknown> = {}, seg: Record<string, unknown> = {}) => ({
  versao: 1,
  segmento: { id: 'sem-compra', name: 'Clientes sem compra', parameters: [DIAS], ...seg },
  sql: SQL,
  ...over,
});
const existing: AudienceShortcut[] = [{ id: 'todos', name: 'Todos os clientes', share: 1 }];

const runner = (over: Partial<PackageRunner> = {}): PackageRunner => ({
  dryRun: async () => ({ gigabytes: 1.2, colunas: ['cuid', 'chv_cliente'] }),
  count: async () => ({ linhas: 3_054_109, clientes: 3_054_109, semCuid: 0 }),
  ...over,
});
const status = (r: Awaited<ReturnType<typeof checkPackage>>, id: string) => r.verificacoes.find((x) => x.id === id)?.status;

describe('usedParameters', () => {
  it('ignora comentário, texto e variável de sistema', () => {
    expect(usedParameters("SELECT 1 -- @a\nWHERE x = '@b' AND y > @c AND z = @@sistema AND w = @c_2")).toEqual(['c', 'c_2']);
  });
});

describe('pacote de segmento', () => {
  it('aceita um pacote válido: query em linhas, parâmetro, grão conferido e share pela contagem', async () => {
    const r = await checkPackage(pacote(), existing, runner());
    expect(r.ok).toBe(true);
    expect(r.verificacoes.every((x) => x.status === 'ok')).toBe(true);
    expect(r.shortcut).toMatchObject({
      id: 'sem-compra',
      dyAttribute: 'faro_aud_sem_compra',
      parameters: [expect.objectContaining({ name: 'dias_sem_compra', default: 180 })],
      origin: { system: 'bigquery' },
    });
    expect(r.shortcut?.sql).toContain('@dias_sem_compra');
    expect(r.shortcut?.share).toBe(Math.round((3_054_109 / BASE_CLIENTES) * 10000) / 10000);
  });

  it('usa o share do pacote quando vem informado', async () => {
    const r = await checkPackage(pacote({}, { share: 0.2 }), existing, runner());
    expect(r.shortcut?.share).toBe(0.2);
  });

  it('confere os parâmetros: usado sem declarar, declarado sem usar, padrão fora do intervalo', async () => {
    const semDeclarar = await checkPackage(pacote({}, { parameters: [] }), existing, runner());
    expect(semDeclarar.ok).toBe(false);
    expect(semDeclarar.verificacoes.find((x) => x.id === 'parametros')?.detalhe).toMatch(/@dias_sem_compra é usado .* não está/);

    const semUso = await checkPackage(pacote({}, { parameters: [DIAS, { ...DIAS, name: 'outro' }] }), existing, runner());
    expect(semUso.verificacoes.find((x) => x.id === 'parametros')?.detalhe).toMatch(/"outro" está em "parameters" mas a query não usa/);

    const fora = await checkPackage(pacote({}, { parameters: [{ ...DIAS, default: 5000 }] }), existing, runner());
    expect(fora.verificacoes.find((x) => x.id === 'parametros')?.detalhe).toMatch(/máximo|fora de min\/max/);
  });

  it('barra query que escreve, sem cuid ou com vários comandos, sem chegar ao BigQuery', async () => {
    let chamou = false;
    const spy = runner({ dryRun: async () => ((chamou = true), { gigabytes: 0, colunas: ['cuid'] }) });
    for (const sql of ['DELETE FROM `a.b.c` WHERE cuid IS NOT NULL', 'SELECT chv_cliente FROM `a.b.c`', 'SELECT cuid FROM t; SELECT 1']) {
      const r = await checkPackage(pacote({ sql }, { parameters: [] }), existing, spy);
      expect(r.ok).toBe(false);
      expect(status(r, 'sql')).toBe('erro');
    }
    expect(chamou).toBe(false);
  });

  it('recusa id ou nome que já existem e pacote malformado', async () => {
    const igualNome = await checkPackage(pacote({}, { id: 'novo', name: 'todos os clientes' }), existing, runner());
    expect(status(igualNome, 'unico')).toBe('erro');
    const semVersao = await checkPackage({ segmento: {}, sql: 'x' }, existing, runner());
    expect(semVersao.ok).toBe(false);
    expect(status(semVersao, 'formato')).toBe('erro');
    const idRuim = await checkPackage(pacote({}, { id: 'Sem Compra!' }), existing, runner());
    expect(idRuim.verificacoes[0]?.detalhe).toMatch(/kebab-case/);
  });

  it('o BigQuery manda: sem cuid no resultado, linhas duplicadas e cuid nulo bloqueiam', async () => {
    const semCuid = await checkPackage(pacote(), existing, runner({ dryRun: async () => ({ gigabytes: 1, colunas: ['chv_cliente'] }) }));
    expect(status(semCuid, 'compila')).toBe('erro');
    expect(semCuid.ok).toBe(false);

    const duplicado = await checkPackage(pacote(), existing, runner({ count: async () => ({ linhas: 9000, clientes: 4200, semCuid: 0 }) }));
    expect(duplicado.verificacoes.find((x) => x.id === 'grao')?.detalhe).toMatch(/9\.000 linhas para 4\.200 clientes/);
    expect(duplicado.ok).toBe(false);

    const nulo = await checkPackage(pacote(), existing, runner({ count: async () => ({ linhas: 10, clientes: 10, semCuid: 2 }) }));
    expect(nulo.verificacoes.find((x) => x.id === 'grao')?.detalhe).toMatch(/2 linhas sem cuid/);

    const vazio = await checkPackage(pacote(), existing, runner({ count: async () => ({ linhas: 0, clientes: 0, semCuid: 0 }) }));
    expect(vazio.ok).toBe(false);
  });

  it('erro de SQL (400) bloqueia; erro de credencial ou rede só avisa', async () => {
    const sqlRuim = await checkPackage(pacote(), existing, runner({ dryRun: async () => Promise.reject(Object.assign(new Error('Unrecognized name: x'), { code: 400 })) }));
    expect(status(sqlRuim, 'compila')).toBe('erro');
    expect(sqlRuim.ok).toBe(false);

    const semRede = await checkPackage(pacote({}, { share: 0.1 }), existing, runner({ dryRun: async () => Promise.reject(new Error('Could not load the default credentials')) }));
    expect(status(semRede, 'compila')).toBe('aviso');
    expect(status(semRede, 'grao')).toBe('pulado');
    expect(semRede.ok).toBe(true);
  });

  it('consulta cara: não conta sozinho e avisa', async () => {
    let contou = false;
    const r = await checkPackage(
      pacote({}, { share: 0.1 }),
      existing,
      runner({ dryRun: async () => ({ gigabytes: 80, colunas: ['cuid'] }), count: async () => ((contou = true), { linhas: 1, clientes: 1, semCuid: 0 }) }),
    );
    expect(contou).toBe(false);
    expect(status(r, 'grao')).toBe('aviso');
    expect(r.ok).toBe(true);
  });

  it('sem BigQuery, exige o share no pacote', async () => {
    const sem = await checkPackage(pacote(), existing, undefined);
    expect(sem.ok).toBe(false);
    expect(status(sem, 'share')).toBe('erro');
    const com = await checkPackage(pacote({}, { share: 0.05 }), existing, undefined);
    expect(com.ok).toBe(true);
    expect(status(com, 'compila')).toBe('pulado');
  });
});
