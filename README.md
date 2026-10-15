# Faro

Orquestração de testes A/B da Petlove sobre o Dynamic Yield — **repositório unificado** das cinco frentes. Comece por [CLAUDE.md](CLAUDE.md) e [docs/specs/00-contexto-geral.md](docs/specs/00-contexto-geral.md). Protótipo de referência: [docs/prototipo/faro-prototipo.html](docs/prototipo/faro-prototipo.html).

| Frente | O quê | Estado | Onde |
|---|---|---|---|
| 1 — Configuração | wizard, gate de design, amostra/duração, ficha do DY, D+1, legado | completa | `features/configuracao`, `services/api/src/experiments`, `packages/config-core` |
| 2 — Painel | lista, detalhe, mapa, decisão/encerramento | portada; persiste no banco e lê o export real do DY | `features/painel`, `services/api/src/painel` |
| 3 — Segmentação | atalhos com regra, motor de sobreposição, regra→SQL, publicação DY | núcleo real (origem: repo segmentacao-ab) | `services/api/src/publico`, `data/models/audiences` |
| 4 — Métricas | resultados reais por teste (consultas do roadmap v3 com o cadastro do Faro injetado), stats puro | E8: sync das três consultas, `GET /results/:faroId` no contrato `ResultsResponse`, painel com NORTE real e testes descobertos no DY | `data/models/results`, `data/queries/roadmap`, `services/api/src/resultados`, `packages/stats` |
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
| `npm run job:sync-roadmap -- [--campanha "<nome>"] [--dry-run]` | **E8.** As três consultas do roadmap (`dy_results` v3, `dy_discovery`, `dy_daily` v3) com o cadastro do Faro injetado nos marcadores → `data/snapshots/roadmap/<dados_ate>/` + `latest.json` (gitignored). `--dry-run` só estima o custo (~30 GB por execução completa); `--campanha` reduz results e daily. Exige `dy_discovery.sql` e `dy_daily_v3.sql` em `data/queries/roadmap/` (ver README da pasta) e a API parada (PGlite). Sem agendamento |
| `npm run job:sync-results -w @faro/api` | Interino: só a `dy_results.sql`, com o cadastro do próprio roadmap (~10 GB/45 dias) → `.data/results.json`; a mesma fonte lê esse arquivo como snapshot sem discovery nem daily |
| `npm run job:publish-audiences -w @faro/api -- --dry-run` | Públicos da frente 3: valida/gera listas `chv_cliente,cuid` em `.data/audiences/` (subida na User Data API ainda manual) |

`job:sync-dy` e `job:sync-results` também rodam pelo botão **Atualizar da DY** da Lista do Painel (`POST /painel/dy-refresh`, ~1 min); a API segue no ar e relê os arquivos ao terminar.

**Fonte de resultados (E8).** `GET /results/:faroId?grain=user|session&platform=all|site|android|ios` devolve o `ResultsResponse` do contrato. `FARO_SOURCE=roadmap|fixtures` escolhe a fonte; sem a variável, roadmap quando existe `data/snapshots/roadmap/latest.json` ou `services/api/.data/results.json`, senão fixtures. `GET /health` diz a fonte em uso e cada resposta traz `source`, `readWindow.origin` e `status`. Testes ativos no DY sem cadastro aparecem como `FARO-0000-NNNN` na API e no painel.

## Segmentos novos

O catálogo (fixture + importados) aparece em `/segmento`. Um segmento novo nasce no artefato **Segmentos Faro** (claude.ai): a pessoa descreve o público em texto corrido, o Claude consulta o catálogo de dados (OpenMetadata e BigQuery, via conectores locais do app) e escreve uma **query livre**, o artefato valida (dry run), roda a volumetria e, aprovado, salva no catálogo do artefato. A única exigência de forma: **uma linha por indivíduo, com `cuid`** (`dim_cliente.public_id`); o artefato bloqueia a aprovação se a contagem mostrar linhas duplicadas ou `cuid` nulo.

Para usar no Faro: no artefato, *Exportar para o Faro*; em `/segmento`, colar o JSON em *Importar do artefato* (`POST /publico/audiences/import`). Itens com `sql` passam pela guarda estática (`publico/sql-guard.ts`: só `SELECT`/`WITH`, um comando, coluna `cuid`) e por um dry run no BigQuery que confere as colunas; itens com `rule` têm o SQL regenerado pelo gerador do Faro (`publico/rule-sql.ts`). O que já existe ou não passa volta em `ignorados`. O segmento importado aparece na etapa de Público do wizard e é publicável por `job:publish-audiences`.

O artefato embute uma cópia da guarda de SQL; depois de mexer em `sql-guard.ts`, rode `node services/api/scripts/check-artifact-sql.ts <segmentos-faro.html>` para conferir que as duas continuam idênticas, e `node services/api/scripts/export-catalog-seed.ts <pasta>` para regerar o catálogo inicial do artefato.

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
