# Frente 4 — STATUS

Atualizado em 2026-10-15 (unificação). Base de produção: `data/models/results/dy_results.sql` (v3), a consulta real de resultados por teste × grão × device × variante — exposições da `dw_corporativo.ft_teste_ab`, compras do `ssot_ga4`, Agresti-Caffo, efeitos em log-razão, Dunnett, Holm/BH, CUPED e leitura bayesiana com recomendação.

## Pronto (MVP)

| Peça | Requisitos | Onde | Evidência |
|---|---|---|---|
| SQL de resultados versionado | MET-04 a MET-13 (no BigQuery) | `data/models/results/dy_results.sql` | dry run validado contra as tabelas reais |
| Sync de resultados | MET-14 (dados) | `services/api/src/resultados/jobs/sync-results.ts` (`npm run job:sync-results`) | materializa `.data/results.json` com todas as linhas |
| Mapeamento para o contrato | MET-14 | `src/resultados/results.ts` | 16 métricas do dy_results → `MetricResult` (valor, uplift, probBetter = p_vence, rótulo via `labelFor`, MDE), vínculo por nome de campanha do DY |
| API de resultados | MET-14 (parcial) | `GET /results/:faroId` | payload com janela de leitura, SRM, contaminados, recomendações do motor e síntese; fallback para fixtures |
| Painel com números reais | — | `src/painel/dataset.ts` | quando `.data/results.json` existe, a NORTE do painel e do detalhe vem do dado real (fixture só para testes sem vínculo) |
| Motor estatístico puro | MET-06, MET-08, MET-09 | `packages/stats` | phi, z de proporções com Agresti-Caffo, médias, SRM (Wilson-Hilferty), MDE; testes com valores conhecidos, incluindo o SRM do Nexus (p < 0,001) |

## Pendente

- Ingestão própria do Daily Activity Stream (MET-03) — hoje a exposição vem da `ft_teste_ab` (D-1, já no BigQuery).
- `metric_values`/`metric_results` como tabelas (hoje: arquivo materializado pelo job).
- Paridade fina com o visualizador (MET-17): o método de delta do visualizador precisa ser documentado antes (pergunta aberta do spec).
- UI de resultados completa no template da frente 5 (MET-15) — o detalhe do painel já mostra a NORTE real; o relatório completo é a próxima etapa.
- Fontes de Fintech (inadimplência), CSAT e linhagem (MET-16).

## Decisões

- Dispositivo → plataforma do contrato: `Total` → `all` (e `site` quando o teste é só web); `iOS`/`Android` diretos; `Mobile`/`Desktop` do web ficam fora do contrato (DECISAO-PENDENTE: granularidade de device no `MetricResult`).
- Vínculo teste ↔ experimento pelo nome da campanha no DY (`dy.campaignName` ou nome do legado) até o label `faro:` existir no export.
