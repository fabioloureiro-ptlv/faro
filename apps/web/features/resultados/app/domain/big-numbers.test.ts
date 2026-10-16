import { describe, expect, it } from 'vitest';
import { resultsResponseSchema, type ResultsResponse } from '@faro/contracts';
import nexus from '@faro/contracts/fixtures/nexus-results.json';
import amostraIncompleta from '@faro/contracts/fixtures/simulados/melhora_confirmada_amostra_incompleta.json';
import srmCenario from '@faro/contracts/fixtures/simulados/srm.json';
import encerrado from '@faro/contracts/fixtures/simulados/encerrado_com_vencedor.json';
import agendado from '@faro/contracts/fixtures/simulados/agendado_sem_dados.json';
import {
  buildBigNumbers,
  daysRead,
  formatCompact,
  formatMetricValue,
  formatSignedPercent,
  hasData,
  isGoodDelta,
  type BigNumber,
} from '.';

const parse = (raw: unknown) => resultsResponseSchema.parse(raw);
/** Recorte consolidado × usuário, como GET /results/:faroId devolve (services/api/resultados/fixtures.ts). */
function slice(
  full: ResultsResponse,
  platform: ResultsResponse['platforms'][number] = 'all',
): ResultsResponse {
  return {
    ...full,
    results: full.results.filter((r) => r.platform === platform && r.grain === full.grain),
    volumes: full.volumes.filter((v) => v.platform === platform),
    health: full.health.filter((h) => h.platform === platform),
  };
}
// Intl usa espaço não separável em "R$ 88,20"; normaliza para a leitura dos testes.
const text = (t: BigNumber) =>
  t.detail
    .map((line) => line.map((s) => s.text).join(''))
    .join(' | ')
    .replace(/\xa0/g, ' ');
const byId = (tiles: BigNumber[], id: BigNumber['id']) => tiles.find((t) => t.id === id)!;

const NORTE = {
  id: 'receita_por_usuario',
  name: 'Receita por usuário',
  unit: 'brl',
  direction: 'higher_better',
} as const;

describe('formatação', () => {
  it('compacta contagens em mil e mi', () => {
    expect(formatCompact(1_100_094)).toBe('1,1 mi');
    expect(formatCompact(21_379)).toBe('21,4 mil');
    expect(formatCompact(438)).toBe('438');
  });
  it('delta com sinal tipográfico', () => {
    expect(formatSignedPercent(1.081)).toBe('+108,1%');
    expect(formatSignedPercent(-0.107)).toBe('−10,7%');
    expect(formatSignedPercent(0)).toBe('0,0%');
  });
  it('valor na unidade do catálogo', () => {
    expect(formatMetricValue(21.83, 'brl').replace('\xa0', ' ')).toBe('R$ 21,83');
    expect(formatMetricValue(0.0746, 'percent')).toBe('7,5%');
    expect(formatMetricValue(0.0022, 'percent')).toBe('0,22%');
    expect(formatMetricValue(null, 'brl')).toBe('—');
  });
  it('direção da métrica decide se o delta é bom', () => {
    expect(isGoodDelta('higher_better', 0.1)).toBe(true);
    expect(isGoodDelta('lower_better', 0.1)).toBe(false);
    expect(isGoodDelta('lower_better', -0.1)).toBe(true);
    expect(isGoodDelta('higher_better', undefined)).toBeUndefined();
  });
});

describe('Nexus (fixture real, consolidado × usuário)', () => {
  const r = slice(parse(nexus));
  const tiles = buildBigNumbers({ results: r, primaryMetricId: NORTE.id, norte: NORTE });

  it('tem os quatro tiles na ordem do protótipo, com Período no lugar de Amostra', () => {
    expect(tiles.map((t) => t.id)).toEqual(['norte', 'expostos', 'periodo', 'split']);
    expect(tiles[0]!.hero).toBe(true);
  });

  it('hero: NORTE +108,1%, melhora confirmada, home nova vs home antiga, chance 100%', () => {
    const hero = byId(tiles, 'norte');
    expect(hero.label).toBe('Métrica principal · Receita por usuário');
    expect(hero.value).toBe('+108,1%');
    expect(hero.valueTone).toBe('good');
    expect(hero.badge).toMatchObject({ tone: 'good', text: 'Melhora confirmada' });
    expect(text(hero)).toBe(
      'home nova R$ 88,20 vs home antiga R$ 21,83 · chance de ser melhor 100%',
    );
    expect(hero.detail[0]!.filter((s) => s.strong).map((s) => s.text)).toEqual([
      'home nova',
      'home antiga',
      '100%',
    ]);
  });

  it('expostos: 1,1 mi no total, por variante e 26.016 contaminados (2,3%)', () => {
    const t = byId(tiles, 'expostos');
    expect(t.label).toBe('Expostos (usuários)');
    expect(t.value).toBe('1,1 mi');
    expect(text(t)).toBe(
      'home antiga 21,4 mil · home nova 1,1 mi | 26.016 viram 2 variantes (2,3%), excluídos',
    );
  });

  it('período: dias distintos da série diária, janela e dias de split instável excluídos', () => {
    const t = byId(tiles, 'periodo');
    expect(t.value).toBe('63 dias');
    expect(text(t)).toBe('31/08 a 12/10 · 6 dias excluídos');
  });

  it('split: 1,9% / 98,1% contra 2% / 98%, sem SRM', () => {
    const t = byId(tiles, 'split');
    expect(t.value).toBe('1,9% / 98,1%');
    expect(t.badge).toMatchObject({ tone: 'good', text: 'ok' });
    expect(text(t)).toBe('planejado 2% / 98% · p = 1,000');
  });

  it('recorte por plataforma muda expostos e NORTE', () => {
    const ios = buildBigNumbers({
      results: slice(parse(nexus), 'ios'),
      primaryMetricId: NORTE.id,
      norte: NORTE,
    });
    expect(byId(ios, 'expostos').value).not.toBe(byId(tiles, 'expostos').value);
    expect(byId(ios, 'norte').value).not.toBe('—');
  });

  it('sem definição da NORTE no catálogo, usa o id e não colore o valor', () => {
    const t = byId(buildBigNumbers({ results: r, primaryMetricId: NORTE.id }), 'norte');
    expect(t.label).toBe('Métrica principal · receita_por_usuario');
    expect(t.value).toBe('+108,1%');
    expect(t.valueTone).toBe('good'); // direção padrão: maior é melhor
    expect(text(t)).toContain('home nova 88,2 vs home antiga 21,83');
  });
});

describe('cenários simulados', () => {
  const CONV = {
    id: 'conversao',
    name: 'Conversão',
    unit: 'percent',
    direction: 'higher_better',
  } as const;

  it('amostra incompleta: tile de Amostra com progresso e barra', () => {
    const tiles = buildBigNumbers({
      results: parse(amostraIncompleta),
      primaryMetricId: CONV.id,
      norte: CONV,
    });
    expect(tiles.map((t) => t.id)).toEqual(['norte', 'expostos', 'amostra', 'split']);
    const t = byId(tiles, 'amostra');
    expect(t.value).toBe('12%');
    expect(t.progress).toBeCloseTo(0.12, 2);
    expect(t.badge).toMatchObject({ tone: 'none', text: 'em coleta' });
    expect(text(t)).toBe('18,2 mil de 151,9 mil por grupo');
  });

  it('significância precoce vira aviso no tile de Amostra', () => {
    const t = byId(
      buildBigNumbers({ results: parse(encerrado), primaryMetricId: CONV.id, norte: CONV }),
      'amostra',
    );
    expect(t.badge).toMatchObject({ tone: 'warn', text: 'em coleta' });
    expect(text(t)).toContain('significância precoce, aguardar amostra');
  });

  it('SRM: split em alerta crítico com p < 0,0001', () => {
    const t = byId(
      buildBigNumbers({ results: parse(srmCenario), primaryMetricId: CONV.id, norte: CONV }),
      'split',
    );
    expect(t.badge).toMatchObject({ tone: 'critical', text: 'SRM' });
    expect(t.value).toBe('51,5% / 48,5%');
    expect(text(t)).toBe('planejado 50% / 50% · p < 0,0001');
  });

  it('agendado sem dados: nada para mostrar', () => {
    const r = parse(agendado);
    expect(hasData(r)).toBe(false);
    expect(hasData(parse(nexus))).toBe(true);
  });

  it('IC95 entra no hero quando a API devolve', () => {
    const r = parse(amostraIncompleta);
    const t = byId(buildBigNumbers({ results: r, primaryMetricId: CONV.id, norte: CONV }), 'norte');
    const nv = r.results.find((x) => x.metricId === CONV.id && x.variantKey === 'variante_a');
    if (nv?.ci95) expect(text(t)).toContain('IC95');
    else expect(text(t)).not.toContain('IC95');
  });
});

describe('sem leitura da métrica principal', () => {
  it('hero explica em vez de mostrar "— vs —"', () => {
    const r = { ...slice(parse(nexus)), results: [] };
    const t = byId(
      buildBigNumbers({ results: r, primaryMetricId: NORTE.id, norte: NORTE }),
      'norte',
    );
    expect(t.value).toBe('—');
    expect(t.badge).toBeUndefined();
    expect(text(t)).toBe(
      'Sem leitura ainda: os números aparecem no dia seguinte à primeira exposição.',
    );
  });
});

describe('dias lidos', () => {
  it('sem série diária, conta a janela de leitura inclusive', () => {
    const r = {
      ...parse(agendado),
      health: [],
      readWindow: { start: '2026-10-21', end: '2026-10-25' },
    };
    expect(daysRead(r)).toBe(5);
  });
  it('janela invertida não quebra', () => {
    const r = {
      ...parse(agendado),
      health: [],
      readWindow: { start: '2026-10-25', end: '2026-10-21' },
    };
    expect(daysRead(r)).toBe(0);
  });
});
