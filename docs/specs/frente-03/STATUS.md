# Frente 3 — STATUS

Atualizado em 2026-10-15 (unificação). Origem: trabalho de segmentação do repo `segmentacao-ab` (regras, SQL BigQuery, cadeia cuid↔public_id) incorporado ao Faro.

## Pronto

| Etapa | Requisitos | Onde | Evidência |
|---|---|---|---|
| Contratos | SEG-03 (forma) | `contracts`: `AudienceCondition`/`AudienceRule` reais (substituem o placeholder), `ExclusionGroup`, `ObservedOverlap`; `AudienceShortcut` com `rule`/`disjointWith`/`sqlRef` | schemas Zod recursivos validando as fixtures |
| Atalhos como dados | SEG-01, SEG-02 | `fixtures/audiences.json` | 12 atalhos, 7 com regra ou SQL versionado; inclui os públicos reais do segmentacao-ab (brinquedo de cão 12m, novos em Saúde 30d) |
| Motor de sobreposição | SEG-09 a SEG-13 (parcial) | `services/api/src/publico/engine.ts` (substitui os mocks da frente 1 em `defaultPorts`) | interseção com disjuntos declarados, severidade com corte de 20% do público, exclusão mútua por `exclusionGroupId`; 9 testes novos + suíte da frente 1 adaptada |
| Elegíveis por dia | SEG-06, SEG-08 (fixture) | `engine.ts` + `fixtures/pages.json` | função pura testada; catálogo semanal via GA4 ainda pendente |
| Regra → SQL | SEG-03, SEG-05 (parcial) | `src/publico/rule-sql.ts` | 1 linha por cliente com `cuid`; janelas sempre `BETWEEN`; propriedade sem fonte mapeada falha pedindo registro em PEDIDOS; todas as regras da fixture compilam em dry run real (1,2–2,2 GB) |
| Publicação no DY (interina) | SEG-07 (parcial) | `src/publico/jobs/publish-audiences.ts` (`npm run job:publish-audiences`) | dry run com orçamento de 50 GB; materializa CSV `chv_cliente,cuid` em `.data/audiences/`; User Data API pendente |

## Mockado / pendente

- Catálogo de páginas e participações: fixture do protótipo (SEG-08 real = job semanal sobre `ssot_ga4`).
- Estimativa de tamanho pela regra (SEG-05) calculada sob demanda: o job estima; a UI ainda usa o `share` do atalho.
- Sugestão de regra a partir do texto (SEG-04): não iniciada.
- UI própria (`features/publico`, construtor de regras): não iniciada — o wizard da frente 1 consome os atalhos novos pela porta.
- Sobreposição observada (SEG-14/15): depende das exposições da frente 4 (`data/models/results/dy_results.sql` já traz `usuarios_2_variantes` por teste).
- Subida na User Data API (SEG-07): manual; quem mantém a integração é pergunta aberta.

## Decisões (DECISAO-PENDENTE no código)

- Identidade DY por `cuid` = `dim_cliente.public_id` (validado no segmentacao-ab: 87% de match com os eventos "Identify User"; `guid_chihuahua` não bate).
- Evento GA4 → cliente via `user_id = public_id` até o id unificado ser confirmado.
- Propriedades mapeadas hoje: clube, plano_saude, especie_pet (dim_cliente). `repet` e `regiao` sem fonte — registrar pedido.
