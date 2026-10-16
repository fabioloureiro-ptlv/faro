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
npm run dev:web   # http://localhost:3000/visao-geral (Visão Geral) e /configuracao (wizard)
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

`job:sync-dy` e `job:sync-results` também rodam pelo botão **Atualizar da DY** da Visão Geral (`POST /painel/dy-refresh`, ~1 min); a API segue no ar e relê os arquivos ao terminar.

**Fonte de resultados (E8).** `GET /results/:faroId?grain=user|session&platform=all|site|android|ios` devolve o `ResultsResponse` do contrato. `FARO_SOURCE=roadmap|fixtures` escolhe a fonte; sem a variável, roadmap quando existe `data/snapshots/roadmap/latest.json` ou `services/api/.data/results.json`, senão fixtures. `GET /health` diz a fonte em uso e cada resposta traz `source`, `readWindow.origin` e `status`. Testes ativos no DY sem cadastro aparecem como `FARO-0000-NNNN` na API e no painel.

## Avisar o time (Slack e Jira)

O DY não tem API para criar campanhas, então quem configura é uma pessoa. Na etapa de revisão do wizard, depois da ficha, o botão **Enviar para o Slack e abrir card no Jira** (`POST /experiments/:faroId/anunciar`) manda o resumo do teste para um canal e abre um card com a ficha. Cada destino só existe se as variáveis dele estiverem na API (`services/api/.env` é lido automaticamente; sem nada configurado o botão responde "não configurado"):

```bash
# Slack, modo recomendado: app com token de bot (escopos chat:write e users:read.email),
# posta no canal e marca o PM que preencheu o teste (e os e-mails de FARO_SLACK_MENTIONS)
FARO_SLACK_BOT_TOKEN=xoxb-...
FARO_SLACK_CHANNEL=#testes-ab
FARO_SLACK_MENTIONS=lider@petlove.com.br,dados@petlove.com.br   # opcional

# Slack, modo simples: Incoming Webhook do canal (só posta, não marca ninguém)
FARO_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Jira Cloud: token de API de um usuário (id.atlassian.com → Security → API tokens)
FARO_JIRA_BASE_URL=https://petlove.atlassian.net
FARO_JIRA_EMAIL=quem@petlove.com.br
FARO_JIRA_API_TOKEN=...
FARO_JIRA_PROJECT_KEY=EXP                 # projeto onde o card é criado
FARO_JIRA_ISSUE_TYPE=Task                 # opcional (padrão: Task)

# Link "ficha e design" na mensagem (já usado pelo CORS)
FARO_WEB_ORIGIN=http://localhost:3000
```

Passo a passo: copie `services/api/.env.example` para `services/api/.env`; crie o app do Slack em https://api.slack.com/apps → *Create New App* → *From a manifest*, colando `docs/slack-app-manifest.json`, instale no workspace e cole o *Bot User OAuth Token* em `FARO_SLACK_BOT_TOKEN`; gere um token de API do Jira e preencha `FARO_JIRA_EMAIL` e `FARO_JIRA_API_TOKEN`. Para testar sem a tela (com a API parada):

```bash
npm run job:anuncio -- FARO-2026-0001 --dry-run   # mostra a mensagem e quem seria marcado
npm run job:anuncio -- FARO-2026-0001             # envia
```

Avisar de novo repete o Slack e reaproveita o card já aberto. O envio fica registrado no outbox (`experiment.announced`, `GET /events?faroId=`).

## Catálogo de segmentos

O catálogo é o arquivo versionado `data/models/audiences/catalog.json`; aparece em `/segmento` (aba Segmentos) e na etapa de Público do wizard. Hoje tem dois segmentos: **Todos os clientes** (sem query) e **Clientes inadimplentes**. Cada segmento com query aponta (`sqlRef`) para um `.sql` na mesma pasta que devolve **uma linha por cliente, com `cuid`** (`dim_cliente.public_id`, o identificador da DY).

**Parâmetros.** Um segmento pode declarar `parameters` no catálogo (nome, rótulo, tipo, padrão, mínimo, máximo, unidade). O nome é um parâmetro nomeado do BigQuery usado na query (`@dias_inadimplencia`): o valor vai separado do texto, nunca concatenado. O wizard e `/segmento` mostram os campos; o experimento guarda o valor escolhido em `audience.params`, e o atributo no DY ganha o valor (`faro_aud_inadimplentes_60`, `_90`, …), porque públicos com valores diferentes são listas diferentes. `job:publish-audiences` aceita `--param=dias_inadimplencia=90`.

**Incluir um segmento novo (pela tela).** Em `/segmento`, **+ Incluir novo segmento**. A pessoa roda a skill `criar-segmento-faro` no Claude Code, que entrega um **pacote JSON** (`versao`, `segmento` com id, nome, atributo DY e `parameters`, e `sql`), e cola na tela. Antes de adicionar, o Faro confere de novo (`publico/package.ts`, `POST /publico/audiences/package/check`): query só de leitura com coluna `cuid` (`publico/sql-guard.ts`), parâmetros declarados = usados, compila no BigQuery (dry run) e, na contagem com os valores padrão, **uma linha por cliente e `cuid` nunca nulo**. Se algo falhar, nada é gravado. O segmento entra pelo `POST /publico/audiences/package` em `services/api/.data/audiences-custom.json` (no servidor da API, fora do catálogo versionado) e aparece na hora na lista e no wizard. O formato do pacote está em `~/.claude/skills/criar-segmento-faro/references/contrato.md`.

**Versionar um segmento.** Para o segmento virar parte do catálogo do repositório, mova a query para `data/models/audiences/` e a entrada para `catalog.json` (com `sqlRef`). O arquivo é lido a cada chamada, sem reiniciar a API. `services/api/src/publico/catalog.test.ts` confere que todo `@parâmetro` da query está declarado e vice-versa.

`POST /publico/audiences/import` (lista de segmentos com `sql` ou `rule`, sem parâmetros) continua disponível, sem tela.

Se o banco local (`services/api/.data/pglite`) ficar ilegível por um encerramento brusco, a API o guarda em `pglite-corrompido-<data>` e recria a partir das fixtures; rascunhos locais se perdem.

## Banco de dados

Em dev a API usa o PGlite (Postgres em WASM) em `services/api/.data/pglite`, sem nada para instalar. Em produção (AppBuilder/Cloud Run) usa o **MySQL gerenciado** da plataforma: com `CLOUD_SQL_INSTANCE`, `DB_IAM_USER` e `DB_NAME` no ambiente (fornecidas pelo `create_database` do AppBuilder), a API conecta via `@google-cloud/cloud-sql-connector` com autenticação IAM da service account, sem senha (`CLOUD_SQL_IP_TYPE=PRIVATE` força IP privado). Para validar o modo MySQL com um banco local, `FARO_MYSQL_URL=mysql://user:senha@host:porta/banco` tem precedência. O schema é único (`db/schema.ts`, dialeto MySQL) e cada banco tem seu DDL em `db/migrations/{mysql,pglite}/`, aplicado na subida; timestamps são strings ISO-8601 UTC (ver comentário no schema).

## Estrutura

| Pasta | O quê |
|---|---|
| `packages/contracts` | Tipos, schemas Zod, eventos e fixtures (protocolo da seção 9) |
| `packages/config-core` | Gate, amostra/duração, prontidão, ficha do DY, checagem D+1 |
| `packages/stats` | Motor estatístico puro (frente 4) |
| `data/models` | SQL versionado: resultados (`results/dy_results.sql`) e públicos (`audiences/`) |
| `services/api` | API Fastify + Drizzle (PGlite em dev): experiments, painel, publico, resultados, templates, jobs |
| `apps/web` | Nuxt 4; cada frente é uma layer em `features/` |
