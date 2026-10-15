# Frente 4 — STATUS

Atualizado em 2026-10-15 (unificação; E8 portada). Este arquivo mescla o trabalho do repositório original da frente 4 (zip faro-hackathon, status de 14/10 preservado em [STATUS-original-frente4.md](STATUS-original-frente4.md)) com o que o repo unificado acrescentou. Método completo em [METODO.md](METODO.md); fontes e reconciliações em [FONTES.md](FONTES.md); plano em [PLAN.md](PLAN.md).

## Pronto

| Peça | Origem | Onde no unificado |
|---|---|---|
| Motor estatístico completo (E1) | frente 4 | `packages/stats`: proporções (Wald/Agresti-Caffo), médias/razões (delta method), probBetter com inversão, rótulos, SRM, MDE/amostra, **CUPED, Holm/BH/Dunnett-Šidák, atribuição/exposição, recomendação (MET-12), síntese (MET-13), gerador seedado** — 64 testes |
| Contratos de resultado (E0) | frente 4 | `contracts/src/results.ts`: `ResultsResponse`, `SrmResult`, `Recommendation`, `Synthesis`, `Funnel`…; `MetricResult` ganhou `ci95`/`maturing`; `MetricDefinition` ganhou `maturationDays` e seção Retenção |
| Fixtures de resultado | frente 4 | `fixtures/nexus-results.json` (92 linhas, série diária, contaminação) + `fixtures/simulados/` (5 cenários gerados pelo motor) |
| Catálogo de 25 métricas (E2 parcial) | frente 4 | `data/models/metrics/catalog.json`, com dono provisório e `maturationDays`; levantamento OpenMetadata em `catalogo-openmetadata-2026-10-14.md` |
| Adaptadores de exposição (E3, rascunho) | frente 4 | `data/models/exposures/`: `dy_activity_stream.sql`, `ga4_variation_impression.sql`, `dw_ft_teste_ab.sql`, `exposures.sql` + `data/tests/exposures_quality.sql` |
| Reconciliações e séries do Nexus | frente 4 | `data/fixtures/` (dts_teste_ab: janela, diário, SRM) e `data/queries/` |
| SQL de resultados v3 em produção | unificação | `data/models/results/dy_results.sql` + `npm run job:sync-results` (594 linhas de 49 testes reais; interino, com o cadastro do roadmap) |
| **E8 — fonte real via consultas do roadmap** (15/10, port) | frente 4 | Contratos 0.4.0 (`MetricResult.role/confirmed/cuped/minEvents/bayes`, `ResultsResponse.source/readWindow.origin/status/guardrailsWorse`, `Allocation.readWindow`, `roadmap-map.ts`). `npm run job:sync-roadmap -- [--campanha] [--dry-run]`: injeta o cadastro do Faro nos marcadores das três consultas (forma confirmada na `dy_results.sql` real: linhas com vírgula à frente, cadastro do roadmap descartado), dry-run de custo, trava de privacidade, snapshots em `data/snapshots/roadmap/` (gitignored). `services/api/src/resultados/roadmap/`: adapter snapshot → `Experiment[]` descobertos (`FARO-0000-NNNN`, convenção do painel) e `ResultsResponse` por faroId × platform × grain; seleção de fonte `FARO_SOURCE=roadmap\|fixtures` (padrão: roadmap se houver `latest.json` ou `.data/results.json`); `GET /results/:faroId?grain=&platform=` no contrato, com fallback nas fixtures (Nexus completo; demais a partir das fixtures da frente 2); `GET /health` diz a fonte. O painel descobre os testes do DY pelo adapter e lê a NORTE real do mesmo snapshot |
| API de resultados ligada ao produto | unificação + E8 | `GET /results/:faroId` devolve `ResultsResponse` (volumes, SRM com `p_srm`, contaminação, MDE, recomendação traduzida do SQL com fallback no motor, síntese, funil derivado, saúde do `dy_daily` quando houver, linhagem); o painel (frente 2) mostra a NORTE real |
| Tela de resultados (E5) | frente 4 | referência visual em `docs/demo/` (stat tiles, forest de impacto, pequenos múltiplos, funil); a versão standalone vive no zip original — a adoção como `features/resultados` no app Nuxt é a próxima etapa |

**Validações executadas (E8, 15/10):** `npm test` (36 arquivos, 374 testes verdes, 3 pulados: paridade e privacidade do snapshot real, que exigem `latest.json`), `npm run typecheck` e `npm run lint` verdes. Cobertos: injetor contra o template mínimo e contra a `dy_results.sql` real, privacidade dos snapshots, adapter sobre a fixture sintética das três consultas (mapeamento de métricas/plataformas/grão, rótulo do Faro, SRM com `p_srm` e dias instáveis, contaminação, MDE, recomendação traduzida e fallback, síntese, funil, saúde, descobertos, recortes), seleção de fonte e snapshot só de resultados, rota `GET /results/:faroId` nas duas fontes com o painel listando os descobertos, fixtures `ResultsResponse` com `source`. Não executado: `--dry-run` real e snapshot do Nexus (sem `dy_discovery.sql`/`dy_daily_v3.sql` no repositório e sem credencial do BigQuery nesta sessão); a paridade (`roadmap-parity.test.ts`) fica em `skip` até existir snapshot.

## Pendente

- **E8:** salvar `dy_discovery.sql` e `dy_daily_v3.sql` em `data/queries/roadmap/` (PEDIDOS #12); rodar `npm run job:sync-roadmap -- --dry-run` e `-- --campanha "Nexus | Nova Home do App"` com credencial; substituir a fixture sintética por ~20 linhas reais de cada consulta; ligar a paridade MET-17.
- Portar a tela de resultados da frente 4 para `features/resultados` (hoje o detalhe do painel mostra a NORTE; o relatório completo segue o protótipo/demo). A linha "Fonte" (origem da janela, status da leitura, snapshot) já vem no payload e entra com a tela.
- Validar os adaptadores de exposição no BigQuery (o original não tinha acesso; o unificado tem — rodar `exposures.sql` e os testes de qualidade).
- Conciliar os dois caminhos de resultado: dy_results v3 (produção hoje, agora lida pela fonte roadmap) × motor `packages/stats` sobre `exposures`/`metric_values` (alvo da paridade MET-17). `job:sync-results` (cadastro do roadmap) e `job:sync-roadmap` (cadastro do Faro) coexistem até as duas consultas que faltam chegarem. A reconciliação com o Hórus (FONTES.md) mostrou que o resultado do Nexus muda de sinal conforme o método — o SQL v4 é bloqueante para a paridade.
- SQL versionado por métrica (`data/models/metrics/<id>.sql`) e registro no OpenMetadata.
- Convergir o catálogo de 25 métricas com o `fixtures/metrics-catalog.json` que alimenta o wizard.
- Fontes de Saúde, Fintech, Retenção e CSAT; linhagem e alertas (E6/E7).

## Decisões pendentes no código

- `inadimplencia`: N = 30 dias como padrão conservador.
- Dispositivo → plataforma no mapeamento do dy_results: `Mobile`/`Desktop` do web sem slot no contrato.
- Vínculo teste ↔ campanha pelo nome no DY até o label `faro:` existir no export.
- E8: descobertos com `FARO-0000-NNNN` por ordem alfabética (o número pode mudar entre snapshots; hash estável exigiria afrouxar `FaroIdSchema`); split planejado 1/n para descobertos; `p_srm` prevalece sobre o qui-quadrado recalculado; campanha com `stream` web e app ao mesmo tempo usa o stream do cadastro ou o de maior volume; papel do SQL fora de norte/guarda vira `exploratoria`; `Desktop`/`Mobile` não exportados; o injetor descarta o cadastro do roadmap que vem abaixo dos marcadores (as datas e controles manuais do roadmap só valem no Faro se importados no cadastro).
