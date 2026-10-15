# Faro

Orquestração de testes A/B da Petlove sobre o Dynamic Yield — **repositório unificado** das cinco frentes. Comece por [CLAUDE.md](CLAUDE.md) e [docs/specs/00-contexto-geral.md](docs/specs/00-contexto-geral.md). Protótipo de referência: [docs/prototipo/faro-prototipo.html](docs/prototipo/faro-prototipo.html).

| Frente | O quê | Estado | Onde |
|---|---|---|---|
| 1 — Configuração | wizard, gate de design, amostra/duração, ficha do DY, D+1, legado | completa | `features/configuracao`, `services/api/src/experiments`, `packages/config-core` |
| 2 — Painel | lista, detalhe, mapa, decisão/encerramento | portada; persiste no banco e lê o export real do DY | `features/painel`, `services/api/src/painel` |
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

## Catálogo de segmentos

O catálogo é o arquivo versionado `data/models/audiences/catalog.json`; aparece em `/segmento` (aba Segmentos) e na etapa de Público do wizard. Hoje tem dois segmentos: **Todos os clientes** (sem query) e **Clientes inadimplentes**. Cada segmento com query aponta (`sqlRef`) para um `.sql` na mesma pasta que devolve **uma linha por cliente, com `cuid`** (`dim_cliente.public_id`, o identificador da DY).

**Parâmetros.** Um segmento pode declarar `parameters` no catálogo (nome, rótulo, tipo, padrão, mínimo, máximo, unidade). O nome é um parâmetro nomeado do BigQuery usado na query (`@dias_inadimplencia`): o valor vai separado do texto, nunca concatenado. O wizard e `/segmento` mostram os campos; o experimento guarda o valor escolhido em `audience.params`, e o atributo no DY ganha o valor (`faro_aud_inadimplentes_60`, `_90`, …), porque públicos com valores diferentes são listas diferentes. `job:publish-audiences` aceita `--param=dias_inadimplencia=90`.

**Incluir um segmento novo:** adicione o `.sql` em `data/models/audiences/` e uma entrada em `catalog.json`. O arquivo é lido a cada chamada, então não precisa reiniciar a API. `services/api/src/publico/catalog.test.ts` confere que todo `@parâmetro` da query está declarado e vice-versa.

**Importação (sem tela).** `POST /publico/audiences/import` segue disponível para segmentos montados fora do app (por exemplo no artefato **Segmentos Faro**): itens com `sql` passam pela guarda estática (`publico/sql-guard.ts`: só `SELECT`/`WITH`, um comando, coluna `cuid`) e por um dry run que confere as colunas; itens com `rule` têm o SQL regenerado (`publico/rule-sql.ts`). Eles ficam em `services/api/.data/audiences-custom.json`, fora do catálogo versionado.

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
