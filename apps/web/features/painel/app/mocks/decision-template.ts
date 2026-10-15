import type { Decision } from '@faro/contracts';

// Mock do template de decisão (frente 5, pedido 7 em docs/specs/PEDIDOS.md).
export const DECISION_TEMPLATE: {
  outcomes: { value: Decision['outcome']; label: string; hint: string }[];
  rationalePrompts: string[];
} = {
  outcomes: [
    {
      value: 'implementar_variante',
      label: 'Implementar variante',
      hint: 'A variante venceu na NORTE sem piorar as GUARDA.',
    },
    {
      value: 'manter_controle',
      label: 'Manter controle',
      hint: 'A variante perdeu ou piorou alguma GUARDA.',
    },
    { value: 'sem_vencedor', label: 'Sem vencedor', hint: 'Amostra completa e nenhuma diferença relevante.' },
    { value: 'invalido', label: 'Teste inválido', hint: 'SRM, contaminação ou configuração errada no DY.' },
  ],
  rationalePrompts: [
    'O que a NORTE mostrou (efeito e chance de ser melhor).',
    'Como ficaram as métricas GUARDA.',
    'O que acontece agora com a variante e com a campanha no DY.',
  ],
};
