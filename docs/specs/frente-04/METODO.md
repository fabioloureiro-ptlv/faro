# Frente 4 — Método estatístico (`packages/stats`)

Versão 0.1.0 (14/10/2026). Este documento é a referência de "como os números são calculados" (MET-15) e do que a paridade com o visualizador (MET-17) precisa reproduzir.

## Unidade e exposição

- Grão de decisão: **usuário** (`user_key` = GUID quando disponível; senão `dyid`/`user_pseudo_id`, com `id_kind`). Grão sessão só onde a métrica suportar.
- `exposures`: uma linha por usuário × experimento, com a variante, a primeira exposição, a plataforma da primeira exposição e `contaminated` (viu mais de uma variante na janela). Contaminados são excluídos e reportados. Implementação de referência: `attribution.ts` (`buildExposures`).
- Só contam eventos com `event_at >= first_exposure_at`, dentro da janela de leitura, excluídos os dias de split instável (`attributeEvents`).
- Controle que volta depois do rollout não conta exposição após o fim da janela (achado do roadmap v3).

## Comparação variante × controle (`evaluateMetric`)

| Tipo | Estatística | Erro padrão | IC 95% do delta relativo |
| --- | --- | --- | --- |
| `proportion` | z de duas proporções, p pooled para o teste | `sqrt(p(1−p)(1/nc + 1/nv))` | Wald não pooled (padrão) ou Agresti-Caffo (`proportionCi: 'agresti_caffo'`, +1 sucesso e +1 fracasso por braço) |
| `mean` | diferença de médias, aproximação normal (Welch) | `sqrt(s²c/nc + s²v/nv)` | `(diff ± z·se) / |controle|` |
| `ratio` | diferença de razões de médias (ex.: ticket = receita ÷ compradores) | delta method: `R²·(var_x/x² + var_y/y² − 2cov/xy)/n` por braço | idem |

- `deltaRelative = (variante − controle) ÷ controle`.
- `probBetter = Φ(z)`; para `lower_better`, `Φ(−z)`.
- Rótulos (contexto, seção 6): ≥ 95% melhora confirmada · ≤ 5% queda confirmada · 80–95% tendência de melhora · 5–20% tendência de queda · demais sem tendência. Limites inclusivos nos extremos (`labels.ts`, testes nos limites 79,9%, 80%, 95%, 5%, 20%).

## Opcionais do roadmap v4 (por métrica, atrás de flags)

- **CUPED** (`cupedAdjust`): `y_adj = y − θ(x − x̄)`, `θ = cov(x,y)/var(x)`, com `x` = mesma métrica nos 28 dias antes da exposição. Reduz variância sem viés no delta. Quando aplicado, o valor exibido por variante é o ajustado e o relatório diz isso.
- **Várias variantes**: `dunnettSidak(p, k) = 1 − (1 − p)^k` (aproximação conservadora de Dunnett).
- **Várias métricas**: Holm nas GUARDAs, Benjamini-Hochberg nas secundárias/exploratórias (`corrections.ts`). A NORTE não recebe correção por métrica.
- **Mínimo de leitura**: 30 eventos por braço e 7 dias em campo antes de rotular (a aplicar no job de `metric_results`).

## SRM, MDE e amostra

- **SRM** (`srm`): qui-quadrado de aderência dos expostos por variante ao split planejado; `df = k − 1`; alerta com `p < 0,001`. Dias de split instável são contados e excluídos da leitura.
- **MDE atual** (`mdeProportion`, `mdeMean`): menor efeito relativo detectável com `n` por braço, 80% de poder e α = 5% bilateral: proporção `(z_{0,975} + z_{0,8})·sqrt(2p(1−p)/n)/p`; média `(z_{0,975} + z_{0,8})·cv·sqrt(2/n)`.
- **Amostra** (`sampleSize*`, `sampleProgress`): inverso do MDE; progresso = `min(n por braço) / necessário`; alerta de significância antes da amostra quando a NORTE já está confirmada com progresso < 100%.

## Recomendação (MET-12) e síntese (MET-13)

Ordem das regras em `recommend.ts`: encerrado/decidido → sem dados → SRM (p < 0,001) → uma variante com ≥ 95% dos expostos (desligar a campanha) → guardrail com queda confirmada → NORTE confirmada e amostra completa (implementar) → NORTE confirmada e amostra incompleta (manter até a amostra) → NORTE com queda confirmada (desligar a variante) → amostra completa sem diferença (encerrar sem vencedor) → manter rodando.

Síntese: a NORTE e até três métricas confirmadas ou em queda (tendência de queda incluída), ordenadas por |delta|, no formato `variante (plataforma): NORTE métrica +x% (rótulo, p%) · …`.

## Paridade com o Nexus

O fixture `nexus.json` traz valor e n por braço, delta, probBetter, rótulo e MDE do visualizador. Os deltas de métricas por usuário não são a razão simples dos valores exibidos (ex.: R$ 21,83 → R$ 88,20 aparece como +108,1%); a hipótese é CUPED 28 dias mais correção do controle pós-rollout. Até o SQL v4 e o export de 13/10 serem compartilhados, a paridade automatizada cobre as proporções (sinal do delta e `probBetter` com tolerância 0,02) e os valores por variante.

## Precisão numérica

`phi` usa a aproximação de Abramowitz-Stegun (erro ≤ 1,5e-7); `phiInv`, Acklam (erro relativo ~1e-9); qui-quadrado via gama incompleta regularizada. Suficiente para rótulos e ICs; não usar para p-valores abaixo de 1e-6.

## Fonte roadmap v3: o que vem pronto do SQL e o que o Faro ainda calcula (E8, 15/10/2026)

Com a fonte roadmap, o motor não recalcula o que a consulta já entrega; a tela continua igual porque o rótulo é sempre o do Faro.

| Número | Vem pronto do SQL (`dy_results` v3) | O Faro calcula |
| --- | --- | --- |
| Valor por variante, `n` | `<m>`, `unidades` | — |
| Delta relativo, IC95, `probBetter`, MDE atual | `uplift_<m>`, `ic_lo_/ic_hi_<m>`, `p_vence_<m>`, `mde_<m>` (já com CUPED, Agresti-Caffo, Dunnett, Holm/BH e mínimo de eventos/dias, conforme o cabeçalho da consulta) | `label = significanceLabel(probBetter)` (regra do contexto, seção 6) |
| Papel, confirmação, CUPED, mínimo de eventos, leitura bayesiana | `papel_`, `confirmado_`, `cuped_`, `eventos_min_`, `uplift_esperado_`, `chance_melhor_`, `perda_ligar_`, `perda_manter_`, `recomendacao_` → `MetricResult.role/confirmed/cuped/minEvents/bayes` | papel fora de norte/guarda vira `exploratoria` (nota no payload) |
| SRM | `p_srm` (p-valor e alerta `p < 0,001`), `share_unidades` | `chiSquare` e `df` com `srm()` sobre as `unidades` e o split do cadastro; `unstableSplitDays` = dias do `dy_daily` com `usuarios_novos > 0` fora da janela de leitura (0 sem o daily) |
| Contaminação | `usuarios_2_variantes` | `share = users ÷ (Σ unidades + users)` |
| Janela de leitura | `data_inicio_leitura`, `data_fim_leitura`, `origem_datas` | — |
| Recomendação | `recomendacao_<norte>` da variante | tradução para o código do Faro (`resultados/roadmap/recommend.ts`); texto nulo ou desconhecido → `recommend()` |
| Síntese | — | `synthesize()` sobre os `MetricResult` montados |
| Funil | — | derivado das taxas: expostos → carrinho (`unidades × conversao_carrinho`) → compra (`compradores`) → clube (`unidades × conversao_clube`) |
| Saúde do teste | `usuarios_novos` por dia × variação × device (`dy_daily`) | NORTE acumulada (somas de `receita`, `compradores`, `transacoes` sobre `usuarios_leitura` acumulado) para receita por usuário, conversão, transações por usuário e ticket; demais NORTEs sem série |
| Amostra planejada (`sample`) | — | não calculada nesta fonte (a consulta traz o mínimo de eventos, não a amostra do design) |

Diferenças esperadas contra `fixtures/nexus-results.json`: rótulos podem mudar onde o visualizador aplicava correções (ex.: churn do clube com `p = 0,19` é "tendência de queda" pela regra do Faro); deltas de métricas `mean` seguem o método do roadmap (CUPED e controle pós-rollout), que é o documentado aqui. O teste `services/api/test/roadmap-parity.test.ts` compara valores (0,5%) e `probBetter` das proporções (0,02) quando há snapshot real.

Sem snapshot, `GET /results/:faroId` monta o mesmo contrato a partir das fixtures (`source: 'fixtures'`): o Nexus completo de `nexus-results.json` e, para os demais, os `MetricResult` e a saúde das fixtures da frente 2 (sem volumes, série diária nem funil).
