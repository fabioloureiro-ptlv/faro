# Frente 1 — STATUS

Atualizado em 15/10/2026. Plano aprovado: [PLAN.md](PLAN.md).

## Pronto

| Etapa | Requisitos | Onde | Evidência |
|---|---|---|---|
| 0 — Fase 0 | contratos, schemas, fixtures | `packages/contracts` | 9 testes de contrato (paridade de tipos, fixtures, eventos) |
| 1 — Modelo e `faroId` | CFG-10, CFG-01 | `services/api/src/db`, `experiments/repository.ts` | 20 criações concorrentes → IDs únicos e sequenciais; `faroId` imutável (400) |
| 2 — Design e gate | CFG-02 a CFG-06 | `config-core/design-gate.ts`, `CfgStepDesign.vue` | cada regra do gate testada isolada; criação de métrica rascunho |
| 3 — Amostra e duração | CFG-07, CFG-08 | `config-core/sample-size.ts`, `duration.ts` | valores conhecidos (p = 3,2%, MDE 5% → 189.943/grupo; cv 6 → 226.048) |
| 4 — Público e sobreposição | CFG-08, CFG-09 | `CfgStepAudience.vue`, `CfgStepOverlap.vue`, mocks da frente 3 | home no app gera conflito com o Nexus; decisão exigida e preservada |
| 5 — Revisão e ficha do DY | CFG-11 | `config-core/dy-sheet.ts`, `CfgDySheet.vue`, `GET /experiments/:id/dy-sheet` | snapshot JSON e Markdown |
| 6 — Confirmação, D+1, auditoria | CFG-12, CFG-13, RNF | `POST /dy-confirmation`, `jobs/run-consistency.ts`, `experiment_audit` | divergência de split vira evento; auditoria com autor e data |
| 7 — Legado e duplicação | CFG-14, CFG-15 | `POST /import-legacy`, `POST /duplicate` | Nexus importado como legado; duplicar limpa datas, DY e decisão |
| 9 — Ajustes de produto 15/10 | CFG-04/05/08/11/12 (feedback do wizard) | `config-core/suggest-dates.ts`, `suggest-mde.ts`, `GET /date-suggestion`, `GET /mde-suggestion`, `Allocation.pageTargets`, `AudienceShortcut.origin`, `CfgStep*.vue` | Métrica criada entra selecionada (NORTE e guardrails); URL/caminho por página na ficha; públicos agrupados por origem + público já criado no DY; datas sugeridas com testes interpostos e janela livre; MDE pela mediana histórica da NORTE; confirmação no DY em 3 fases |
| 10 — Avisar o time (15/10, ideia do Fabio) | CFG-11/12 (hand-off para quem configura o DY) | `api/src/anuncio/` (`resumo.ts`, `clients.ts`, `routes.ts`), `POST /experiments/:id/anunciar`, evento `experiment.announced` (contratos 0.6.0), botão na `CfgStepReview.vue`, variáveis `FARO_SLACK_*`/`FARO_JIRA_*` (README) | Resumo do teste no Slack (webhook) e card no Jira (REST v2) com a ficha; card reaproveitado ao avisar de novo; 12 testes (resumo, rota, clientes com fetch falso, ambiente). Sem credencial nesta sessão: envio real não executado |
| 8 — Export do DY real | CFG-13, CFG-14 (dados) | `jobs/sync-dy-campaigns.ts`, `adapters/dy-export-file.ts`, `GET /experiments/dy-campaigns`, select na importação | Sync de 15/10 (janela 2026-04-14 a 2026-10-14): 2.190 campanhas e 7.698 snapshots; select da importação populado com campanhas reais no navegador |

Verificação de 14/10: `npm test` (79 testes), `npm run typecheck`, `npm run lint` limpos. Fluxo ponta a ponta no navegador: criar → design → público (home no app) → 3 conflitos resolvidos → revisão → ficha → confirmação; importação de legado pela UI; sem rolagem horizontal a 375px; job D+1 pela CLI.

Verificação de 15/10 (etapa 8): `npm test` (84 testes), `npm run typecheck`, `npm run lint` limpos; `npm run job:sync-dy -- --meses=6` contra o BigQuery real; correção de portabilidade Windows em `server.ts` (`fileURLToPath` em vez de `url.pathname`).

Verificação de 15/10 (etapa 9): `npm test` (328 testes, 30 arquivos), `npm run typecheck`, `npm run lint` limpos. No navegador: métrica criada em Saúde vira a NORTE e o dropdown muda de área; guardrail criada entra selecionada; alvo de página aparece na revisão e na ficha; sugestão de datas lista o teste interposto do carrinho (FARO-2026-0002) e a janela livre; base histórica da conversão sugere o MDE; confirmação só abre depois de copiar a ficha e marcar o passo 2. Prettier não foi aplicado (107 arquivos já fora do padrão antes desta etapa).

## Mockado (até as frentes donas entregarem — ver `docs/specs/PEDIDOS.md`)

- Catálogo de métricas e criação de rascunho (frente 4): fixture + tabela `metric_requests`.
- Elegíveis por dia, sobreposição e atributo DY de público (frente 3): regras do protótipo.
- Templates (frente 5): dois fixos.
- Export do DY (frente 4): **interino real** — `npm run job:sync-dy` lê o BigQuery (`ssot_dynamic_yield`, 6 meses) e grava `.data/dy-campaigns.json`, servido por `adapters/dy-export-file.ts`; sem o arquivo (ex.: testes), cai no mock em memória. Limites: labels vazios, plataformas inferidas do daily_activity_stream (7 dias), campanhas com > 20 variações (Dynamic Content) ficam de fora, % de tráfego segue 100%.

## Bloqueios e riscos

- Sem SSO: identidade por header (DECISAO-PENDENTE 10).
- PGlite em dev aceita um processo por diretório de dados: pare a API antes de rodar o job D+1 pela CLI. Em produção (Postgres) isso não se aplica.
- Iniciativa de motor interno de A/B no Confluence (espaço nexus) pode mudar a premissa "DY como motor".
- Specs 02–05 não estavam no repositório; contratos derivados só do `00`.
- Base histórica do MDE usa o dataset do painel (fixtures da frente 4 ou `.data/results.json` após o sync); com poucos testes da mesma NORTE a mediana é frágil — a UI mostra a quantidade.
- Alvos de página (URL/caminho) são texto livre até a frente 3 publicar os valores canônicos no catálogo (PEDIDOS #9).
- Sem testes de componente do front nesta entrega (lógica coberta no `config-core` e na API; UI verificada manualmente).
