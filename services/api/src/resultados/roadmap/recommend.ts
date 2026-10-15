// E8 — tradução de `recomendacao_<norte>` (texto da consulta do roadmap) para o código do Faro,
// com os mesmos títulos e corpos de packages/stats/src/recommend.ts. O motor não é alterado.
import type { Recommendation, RecommendationCode } from '@faro/contracts';

const RULES: [RegExp, RecommendationCode][] = [
  [/^ligar variante/i, 'implementar'],
  [/^manter controle/i, 'desligar_variante'],
  [/^continuar coletando/i, 'manter_rodando'],
  [/^sem diferen/i, 'encerrar_sem_vencedor'],
  [/^n[aã]o ligar/i, 'avaliar_guardrail'],
  [/^aguardar \(split desigual/i, 'investigar_srm'],
  [/^aguardar \(decidido/i, 'desligar_campanha'],
  [/^aguardar \((volume baixo|menos de|poucos eventos)/i, 'manter_ate_amostra'],
  [/^sem dado/i, 'aguardando_dados'],
];

export function recommendationCode(text: string | null | undefined): RecommendationCode | undefined {
  const t = (text ?? '').trim();
  if (!t) return undefined;
  return RULES.find(([re]) => re.test(t))?.[1];
}

/** Textos fixos por código (os de recommend.ts, sem as partes que dependem de números). */
export const TEXTS: Record<RecommendationCode, Pick<Recommendation, 'title' | 'body' | 'severity'>> = {
  encerrado: { title: 'Encerrado', body: 'Teste encerrado. Campanha desligada no DY.', severity: 'ok' },
  aguardando_dados: { title: 'Aguardando início', body: 'Os dados aparecem assim que a primeira exposição for registrada.', severity: 'info' },
  investigar_srm: { title: 'Investigar a alocação antes de decidir', body: 'Os grupos estão fora do split planejado (SRM). Qualquer leitura agora pode estar enviesada. Verifique regras de exibição e gatilhos no DY.', severity: 'risk' },
  desligar_campanha: { title: 'Desligar a campanha no Dynamic Yield', body: 'Uma variante já está com ~100% do tráfego ou o teste foi decidido. O teste não produz mais leitura e o controle residual só gera ruído.', severity: 'warn' },
  avaliar_guardrail: { title: 'Avaliar o trade-off com o guardrail', body: 'Um guardrail piorou de forma confirmada. Discuta com o time antes de implementar.', severity: 'warn' },
  implementar: { title: 'Implementar a variante e desligar a campanha no DY', body: 'A métrica norte melhorou de forma confirmada e a leitura mínima foi atingida.', severity: 'ok' },
  manter_ate_amostra: { title: 'Manter rodando até a amostra planejada', body: 'A leitura ainda não atingiu o mínimo de volume, dias ou eventos. Parar agora aumenta o risco de falso positivo.', severity: 'warn' },
  desligar_variante: { title: 'Desligar a variante', body: 'A métrica norte piorou de forma confirmada; manter o controle.', severity: 'risk' },
  encerrar_sem_vencedor: { title: 'Encerrar sem vencedor', body: 'A leitura não mostrou diferença relevante na métrica norte.', severity: 'warn' },
  manter_rodando: { title: 'Manter rodando', body: 'Ainda sem leitura conclusiva na métrica norte.', severity: 'warn' },
};

/** Recomendação a partir do texto do SQL; `undefined` quando o texto é nulo ou desconhecido (cai em recommend()). */
export function translateRecommendation(text: string | null | undefined, norteName: string): Recommendation | undefined {
  const code = recommendationCode(text);
  if (!code) return undefined;
  const t = TEXTS[code];
  return {
    code,
    title: t.title,
    body: `${t.body.replace('métrica norte', norteName)} Roadmap: “${(text ?? '').trim()}”.`,
    severity: t.severity,
  };
}
