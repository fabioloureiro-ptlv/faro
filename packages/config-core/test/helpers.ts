import type { Experiment } from '@faro/contracts';

export function completeExperiment(over: Partial<Experiment> = {}): Experiment {
  return {
    faroId: 'FARO-2026-0042',
    name: 'Selo de entrega rápida na busca',
    bu: 'ecom',
    ownerSquad: 'Squad Descoberta',
    ownerEmail: 'pm@example.com',
    status: 'rascunho',
    design: {
      context:
        'Dados de busca mostram que 38% das sessões que buscam ração terminam sem clique em produto, e o prazo é o 2º motivo de reclamação.',
      hypothesis: {
        change: 'mostrarmos o selo “chega amanhã” nos cards da busca',
        expectedEffect: 'a conversão para o carrinho vai aumentar',
        because: 'o cliente sabe o prazo antes de abrir o produto',
      },
      control: { name: 'Controle', description: 'Card da busca sem informação de entrega' },
      variants: [{ key: 'a', name: 'Variante A', description: 'Card com selo “Chega amanhã”' }],
      primaryMetricId: 'conversao_carrinho',
      secondaryMetricIds: ['conversao', 'receita_por_usuario'],
      guardrailMetricIds: ['tempo_carregamento'],
      mdeRelative: 0.05,
    },
    audience: { description: 'Todos os clientes', source: 'atalho', estimatedShare: 1 },
    allocation: {
      platforms: ['site', 'android', 'ios'],
      pages: ['busca'],
      trafficPercent: 50,
      split: [0.5, 0.5],
      startDate: '2026-10-19',
      endDate: '2026-11-09',
    },
    legacy: false,
    createdAt: '2026-10-14T10:00:00-03:00',
    updatedAt: '2026-10-14T10:00:00-03:00',
    ...over,
  };
}
