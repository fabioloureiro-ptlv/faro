import { describe, expect, it } from 'vitest';
import pages from '@faro/contracts/fixtures/pages.json' with { type: 'json' };
import { buildDySheet, dySheetToMarkdown, variationNames } from '../src/index.ts';
import { completeExperiment } from './helpers.ts';

const ctx = { metric: { id: 'conversao_carrinho', name: 'Conversão para o carrinho' }, pages: pages.pages, generatedAt: '2026-10-14T10:00:00-03:00' };

describe('ficha do DY (CFG-11)', () => {
  it('tem um bloco por campo do console, sem valor vazio', () => {
    const sheet = buildDySheet(completeExperiment({ status: 'pronto_para_configurar' }), ctx);
    expect(sheet.blocks.map((b) => b.key)).toEqual([
      'campaign_name', 'labels', 'campaign_type', 'selector', 'pages', 'platforms',
      'audience', 'traffic', 'variations', 'split', 'primary_metric', 'dates',
    ]);
    for (const b of sheet.blocks) expect(b.value.trim(), b.key).not.toBe('');
  });

  it('nome, labels e variações carregam o faroId', () => {
    const sheet = buildDySheet(completeExperiment(), ctx);
    const v = (k: string) => sheet.blocks.find((b) => b.key === k)!.value;
    expect(v('campaign_name')).toBe('FARO-2026-0042 | Selo de entrega rápida na busca');
    expect(v('labels').split('\n')).toContain('faro:FARO-2026-0042');
    expect(v('variations')).toBe('FARO-2026-0042:controle\nFARO-2026-0042:a');
    expect(v('primary_metric')).toBe('Add to Cart');
    expect(v('campaign_type')).toBe('Custom Code');
  });

  it('legado usa os nomes de variação que já existem no DY', () => {
    const e = completeExperiment({ legacy: true });
    e.design.control.name = 'home antiga';
    e.design.variants[0]!.name = 'home nova';
    expect(variationNames(e)).toEqual(['home antiga', 'home nova']);
  });

  it('snapshot JSON e Markdown', () => {
    const sheet = buildDySheet(
      completeExperiment({ audience: { description: 'Tutores de cães', source: 'atalho', estimatedShare: 0.68, dyAttribute: 'faro_publico_caes' }, allocation: { platforms: ['android', 'ios'], pages: ['home', 'busca'], trafficPercent: 30, split: [0.5, 0.5], startDate: '2026-10-19', endDate: '2026-11-09' } }),
      ctx,
    );
    expect(sheet).toMatchSnapshot();
    expect(dySheetToMarkdown(sheet)).toMatchSnapshot();
  });
});
