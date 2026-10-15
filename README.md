# Faro

Orquestração de testes A/B da Petlove sobre o Dynamic Yield — **repositório unificado** das cinco frentes. Comece por [CLAUDE.md](CLAUDE.md) e [docs/specs/00-contexto-geral.md](docs/specs/00-contexto-geral.md). Protótipo de referência: [docs/prototipo/faro-prototipo.html](docs/prototipo/faro-prototipo.html).

| Frente | O quê | Estado | Onde |
|---|---|---|---|
| 1 — Configuração | wizard, gate de design, amostra/duração, ficha do DY, D+1, legado | completa | `features/configuracao`, `services/api/src/experiments`, `packages/config-core` |
| 2 — Painel | lista, detalhe, mapa, capacidade, órfãs, decisão/encerramento | portada; persiste no banco e lê o export real do DY | `features/painel`, `services/api/src/painel` |
| 3 — Segmentação | atalhos com regra, motor de sobreposição, regra→SQL, publicação DY | núcleo real (origem: repo segmentacao-ab) | `services/api/src/publico`, `data/models/audiences` |
| 4 — Métricas | resultados reais por teste (dy_results.sql v3), stats puro | MVP: sync + API + painel com NORTE real | `data/models/results`, `services/api/src/resultados`, `packages/stats` |
| 5 — Templates | biblioteca de 8 templates + template de relatório | MVP como dados | `fixtures/campaign-templates.json`, `services/api/src/templates` |

STATUS por frente em `docs/specs/frente-0X/STATUS.md`; decisões de arquitetura em `docs/adr/`.

## Rodar

Node 22.12+ (testado em 24).

```bash
npm install
npm run dev:api   # http://127.0.0.1:4000 — PGlite em services/api/.data, semeado com as fixtures
npm run dev:web   # http://localhost:3000/configuracao (wizard) e /painel
```

## Verificar

```bash
npm test && npm run typecheck && npm run lint
```

## Jobs (BigQuery via ADC: `gcloud auth application-default login`)

| Comando | O quê |
|---|---|
| `npm run job:sync-dy -w @faro/api -- --meses=6` | Export do DY (campanhas, variações, snapshots) → `.data/dy-campaigns.json`; alimenta importação de legado, checagem D+1 e órfãs |
| `npm run job:dy-consistency -- --refdate=AAAA-MM-DD` | Checagem D+1 (pare a API antes, por causa do PGlite) |
| `npm run job:sync-results -w @faro/api` | Resultados reais dos testes (dy_results.sql, ~10 GB/45 dias) → `.data/results.json`; o painel e `GET /results/:faroId` passam a usar números reais |
| `npm run job:publish-audiences -w @faro/api -- --dry-run` | Públicos da frente 3: valida/gera listas `chv_cliente,cuid` em `.data/audiences/` (subida na User Data API ainda manual) |

`job:sync-dy` e `job:sync-results` também rodam pelo botão **Atualizar da DY** da Lista do Painel (`POST /painel/dy-refresh`, ~1 min); a API segue no ar e relê os arquivos ao terminar.

## Segmentos novos

O catálogo (fixture + importados) aparece em `/segmento`. Um segmento novo nasce no artefato **Segmentos Faro** (claude.ai): a pessoa descreve o público em texto corrido, o Claude sugere a **regra** (`AudienceRule`), o artefato gera a query, roda a volumetria no BigQuery e, aprovado, salva no catálogo do artefato. Para usar no Faro: no artefato, *Exportar para o Faro*; em `/segmento`, colar o JSON em *Importar do artefato* (`POST /publico/audiences/import`). A regra é revalidada e o SQL regenerado pelo gerador do Faro (`publico/rule-sql.ts`); o que já existe ou não compila volta em `ignorados`. O segmento importado aparece na etapa de Público do wizard.

O artefato embute uma porta JS do gerador de SQL; depois de mexer em `rule-sql.ts`, rode `node services/api/scripts/check-artifact-sql.ts <segmentos-faro.html>` para conferir que as duas continuam idênticas, e `node services/api/scripts/export-catalog-seed.ts <pasta>` para regerar o catálogo inicial do artefato.

Se o banco local (`services/api/.data/pglite`) ficar ilegível por um encerramento brusco, a API o guarda em `pglite-corrompido-<data>` e recria a partir das fixtures; rascunhos locais se perdem.

## Estrutura

| Pasta | O quê |
|---|---|
| `packages/contracts` | Tipos, schemas Zod, eventos e fixtures (protocolo da seção 9) |
| `packages/config-core` | Gate, amostra/duração, prontidão, ficha do DY, checagem D+1 |
| `packages/stats` | Motor estatístico puro (frente 4) |
| `data/models` | SQL versionado: resultados (`results/dy_results.sql`) e públicos (`audiences/`) |
| `services/api` | API Fastify + Drizzle (PGlite em dev): experiments, painel, publico, resultados, templates, jobs |
| `apps/web` | Nuxt 4; cada frente é uma layer em `features/` |
