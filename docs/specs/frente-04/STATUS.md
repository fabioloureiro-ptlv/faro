# Frente 4 — STATUS

Atualizado em 2026-10-15 (unificação). Este arquivo mescla o trabalho do repositório original da frente 4 (zip faro-hackathon, status de 14/10 preservado em [STATUS-original-frente4.md](STATUS-original-frente4.md)) com o que o repo unificado acrescentou. Método completo em [METODO.md](METODO.md); fontes e reconciliações em [FONTES.md](FONTES.md); plano em [PLAN.md](PLAN.md).

## Pronto

| Peça | Origem | Onde no unificado |
|---|---|---|
| Motor estatístico completo (E1) | frente 4 | `packages/stats`: proporções (Wald/Agresti-Caffo), médias/razões (delta method), probBetter com inversão, rótulos, SRM, MDE/amostra, **CUPED, Holm/BH/Dunnett-Šidák, atribuição/exposição, recomendação (MET-12), síntese (MET-13), gerador seedado** — 64 testes |
| Contratos de resultado (E0) | frente 4 | `contracts/src/results.ts`: `ResultsResponse`, `SrmResult`, `Recommendation`, `Synthesis`, `Funnel`…; `MetricResult` ganhou `ci95`/`maturing`; `MetricDefinition` ganhou `maturationDays` e seção Retenção |
| Fixtures de resultado | frente 4 | `fixtures/nexus-results.json` (92 linhas, série diária, contaminação) + `fixtures/simulados/` (5 cenários gerados pelo motor) |
| Catálogo de 25 métricas (E2 parcial) | frente 4 | `data/models/metrics/catalog.json`, com dono provisório e `maturationDays`; levantamento OpenMetadata em `catalogo-openmetadata-2026-10-14.md` |
| Adaptadores de exposição (E3, rascunho) | frente 4 | `data/models/exposures/`: `dy_activity_stream.sql`, `ga4_variation_impression.sql`, `dw_ft_teste_ab.sql`, `exposures.sql` + `data/tests/exposures_quality.sql` |
| Reconciliações e séries do Nexus | frente 4 | `data/fixtures/` (dts_teste_ab: janela, diário, SRM) e `data/queries/` |
| SQL de resultados v3 em produção | unificação | `data/models/results/dy_results.sql` + `npm run job:sync-results` (594 linhas de 49 testes reais) |
| API de resultados ligada ao produto | unificação | `GET /results/:faroId` com janela de leitura, SRM, contaminados, recomendações do motor SQL e síntese; o painel (frente 2) mostra a NORTE real |
| Tela de resultados (E5) | frente 4 | referência visual em `docs/demo/` (stat tiles, forest de impacto, pequenos múltiplos, funil); a versão standalone vive no zip original — a adoção como `features/resultados` no app Nuxt é a próxima etapa |

## Pendente

- Portar a tela de resultados da frente 4 para `features/resultados` (hoje o detalhe do painel mostra a NORTE; o relatório completo segue o protótipo/demo).
- Validar os adaptadores de exposição no BigQuery (o original não tinha acesso; o unificado tem — rodar `exposures.sql` e os testes de qualidade).
- Conciliar os dois caminhos de resultado: dy_results v3 (produção hoje) × motor `packages/stats` sobre `exposures`/`metric_values` (alvo da paridade MET-17). A reconciliação com o Hórus (FONTES.md) mostrou que o resultado do Nexus muda de sinal conforme o método — o SQL v4 é bloqueante para a paridade.
- SQL versionado por métrica (`data/models/metrics/<id>.sql`) e registro no OpenMetadata.
- Convergir o catálogo de 25 métricas com o `fixtures/metrics-catalog.json` que alimenta o wizard.
- Fontes de Saúde, Fintech, Retenção e CSAT; linhagem e alertas (E6/E7).

## Decisões pendentes no código

- `inadimplencia`: N = 30 dias como padrão conservador.
- Dispositivo → plataforma no mapeamento do dy_results: `Mobile`/`Desktop` do web sem slot no contrato.
- Vínculo teste ↔ campanha pelo nome no DY até o label `faro:` existir no export.
