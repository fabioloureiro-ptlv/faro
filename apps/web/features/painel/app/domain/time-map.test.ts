import { describe, expect, it } from 'vitest';
import { ExperimentSchema, PageDefinitionSchema } from '@faro/contracts';
import experiments from '@faro/contracts/fixtures/experiments.json';
import pages from '@faro/contracts/fixtures/pages-painel.json';
import { addDays, buildTimeMap, type TimeMap } from '.';

const exps = experiments.items.map((e) => ExperimentSchema.parse(e));
const catalog = pages.items.map((p) => PageDefinitionSchema.parse(p));
const TODAY = '2026-10-14';

const map = (bu: Parameters<typeof buildTimeMap>[2]['bu'] = 'todas') =>
  buildTimeMap(exps, catalog, { bu, today: TODAY });
const lane = (m: TimeMap, pageId: string) => m.lanes.find((l) => l.pageId === pageId);
const bar = (m: TimeMap, pageId: string, faroId: string) =>
  lane(m, pageId)?.bars.find((b) => b.faroId === faroId);

describe('janela e régua', () => {
  const m = map();

  it('padrão: 45 dias para trás e 75 para frente de hoje', () => {
    expect(m.start).toBe('2026-08-30');
    expect(m.end).toBe('2026-12-28');
  });

  it('marca o início de cada mês da janela', () => {
    expect(m.ticks.map((t) => t.label)).toEqual(['set', 'out', 'nov', 'dez']);
    expect(m.ticks[0]!.left).toBeCloseTo((2 / 121) * 100, 5);
  });

  it('linha de hoje no meio do dia de hoje; ausente fora da janela', () => {
    expect(m.todayLeft).toBeCloseTo(((45 + 0.5) / 121) * 100, 5);
    expect(
      buildTimeMap(exps, catalog, { bu: 'todas', today: TODAY, from: '2026-11-01' }).todayLeft,
    ).toBeUndefined();
  });

  it('janela customizada recorta barras e sinaliza o recorte', () => {
    const b = bar(map(), 'home', 'FARO-2026-0001')!;
    expect(b).toMatchObject({ left: 0, clippedStart: true, clippedEnd: false });
    const short = buildTimeMap(exps, catalog, {
      bu: 'todas',
      today: TODAY,
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(bar(short, 'home', 'FARO-2026-0008')).toMatchObject({ clippedEnd: true });
    expect(lane(short, 'checkout')!.bars.map((x) => x.faroId)).toEqual(['FARO-2026-0007']); // 0006 acabou em set
  });

  it('addDays atravessa meses e anos', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('linhas por página', () => {
  const m = map();

  it('segue a ordem do catálogo e omite páginas sem teste na janela', () => {
    expect(m.lanes.map((l) => l.pageId)).toEqual([
      'home',
      'busca',
      'pdp',
      'carrinho',
      'checkout',
      'saude',
      'conta',
    ]);
  });

  it('teste em duas páginas aparece nas duas', () => {
    expect(bar(m, 'home', 'FARO-2026-0004')).toBeDefined();
    expect(bar(m, 'saude', 'FARO-2026-0004')).toBeDefined();
  });

  it('cancelado não aparece', () => {
    expect(m.lanes.flatMap((l) => l.bars).some((b) => b.faroId === 'FARO-2026-0011')).toBe(false);
  });

  it('barras simultâneas ficam em sub-linhas diferentes; sequenciais reaproveitam', () => {
    const home = lane(m, 'home')!;
    expect(home.rows).toBe(4);
    expect(new Set(home.bars.map((b) => b.row)).size).toBe(4);
    const busca = lane(m, 'busca')!; // 0009 (03/11–24/11) e 0010 (10/11–08/12) se cruzam
    expect(busca.rows).toBe(2);
  });

  it('antes do DY a barra é planejada', () => {
    expect(bar(m, 'home', 'FARO-2026-0008')!.planned).toBe(true);
    expect(bar(m, 'home', 'FARO-2026-0005')!.planned).toBe(false); // configurado_no_dy
  });
});

describe('contorno de sobreposição', () => {
  const m = map();

  it('alto sem decisão nos dois lados (Nexus × Onboarding Saúde na home)', () => {
    expect(bar(m, 'home', 'FARO-2026-0001')).toMatchObject({ overlap: 'alto', overlapUnresolved: true });
    expect(bar(m, 'home', 'FARO-2026-0004')).toMatchObject({ overlap: 'alto', overlapUnresolved: true });
  });

  it('alto já resolvido (exclusão mútua) mantém contorno sem pendência', () => {
    expect(bar(m, 'home', 'FARO-2026-0005')).toMatchObject({ overlap: 'alto', overlapUnresolved: false });
  });

  it('só conta sobreposição com teste na mesma página', () => {
    // 0004 cruza o Nexus na home, mas na Área Saúde está sozinho.
    expect(bar(m, 'saude', 'FARO-2026-0004')!.overlap).toBeUndefined();
    // 0005 sobrepõe 0003 na PDP, e 0008 na home.
    expect(bar(m, 'pdp', 'FARO-2026-0005')).toMatchObject({ overlap: 'medio' });
  });

  it('sem sobreposição, sem contorno', () => {
    expect(bar(m, 'carrinho', 'FARO-2026-0002')!.overlap).toBeUndefined();
  });
});

describe('filtro de BU', () => {
  it('Ecossistema (todas): nada esmaecido', () => {
    expect(
      map()
        .lanes.flatMap((l) => l.bars)
        .every((b) => !b.faded),
    ).toBe(true);
  });

  it('Saúde: testes de outras BUs que cruzam aparecem esmaecidos', () => {
    const m = map('saude');
    expect(bar(m, 'home', 'FARO-2026-0001')!.faded).toBe(false); // ecossistema conta como da BU
    expect(bar(m, 'home', 'FARO-2026-0004')!.faded).toBe(false);
    expect(bar(m, 'home', 'FARO-2026-0005')).toMatchObject({ faded: true, bu: 'ecom' });
    expect(bar(m, 'home', 'FARO-2026-0008')).toMatchObject({ faded: true, bu: 'servicos' });
  });

  it('teste de outra BU que não cruza nenhum da BU some', () => {
    const m = map('fintech');
    expect(lane(m, 'checkout')!.bars.map((b) => b.faroId)).toEqual(['FARO-2026-0007']); // 0006 (ecom, set) não cruza
    expect(lane(m, 'pdp')).toBeUndefined(); // só ecom na PDP
  });
});

describe('destino e observação por barra (mapa só com testes da DY)', () => {
  it('sem extra, a barra não traz destino; com extra, traz href e nota', () => {
    const [primeiro] = exps;
    const sem = buildTimeMap([primeiro!], catalog, { bu: 'todas', today: TODAY });
    const barra = sem.lanes.flatMap((l) => l.bars)[0]!;
    expect(barra).not.toHaveProperty('href');
    expect(barra).not.toHaveProperty('note');

    const com = buildTimeMap([primeiro!], catalog, {
      bu: 'todas',
      today: TODAY,
      extra: (e) => ({ href: `/testes-ab?campanha=${e.faroId}`, note: 'DY · saudável' }),
    });
    expect(com.lanes.flatMap((l) => l.bars)[0]).toMatchObject({ href: `/testes-ab?campanha=${primeiro!.faroId}`, note: 'DY · saudável' });
  });
});
