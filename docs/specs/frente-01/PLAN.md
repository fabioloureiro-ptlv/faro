# Plano — Fase 0 + Frente 1 (Simplificação da configuração) do Faro

## Contexto

Hoje os testes A/B nascem direto no console do Dynamic Yield (DY), sem design registrado, sem cálculo de amostra/duração e com erros de configuração descobertos só com o teste rodando (ex.: split instável e 2,3% de contaminação do Nexus). A frente 1 entrega um wizard guiado (Design → Público → Sobreposição → Revisão) que torna o design obrigatório, calcula amostra/duração/viabilidade, gera `faroId` e a ficha de configuração do DY, registra a confirmação e checa divergências no D+1.

`/Users/antonio.laky/Faro` está **vazio** (sem git, sem código). O contexto geral proíbe código de produto antes da Fase 0 (`packages/contracts`), então esta sessão faz **Fase 0 + frente 1**.

**Decisões do usuário:** escopo Fase 0 + frente 1 · front Nuxt 4 + Vue 3 + Pinia (padrão do chapter) · API Fastify + Drizzle + PGlite (Postgres embutido em dev/testes; Postgres real em produção sem mudar código).

## Achados da exploração

- **Protótipo** (`~/Downloads/faro-prototipo.html`, idêntico byte a byte ao artifact `FTFXpZhRkdf8HGjUXvLmg7`; JS puro, será versionado em `docs/prototipo/`): referência de comportamento e dados a portar para TypeScript:
  - `designChecks` (gate), `sampleSize` (constante 15,7 ≈ (1,96+0,84)²·2), `eligible` (tráfego por página × share de plataforma × share de público × % tráfego), `overlap`/`conflictsOf` (severidade alto se mesma primária ou carrinho/checkout; baixo se < 2.000/dia), `isFigma`, `estimatePanel` (alertas de duração), `metricForm` (criar métrica).
  - Dados: `PAGES` (tráfego diário), `PLATS` (share), `SEG`, `ROWS` (catálogo de métricas com base/cv), Nexus com `results.fixed` (consolidado + Android/iOS, MDE, diário) e 6 testes simulados (`e1`–`e7`).
- **Visualizador atual:** não está no GitHub da Petlove; o Confluence aponta para "Shiny - Teste A/B - Hórus" (R/Shiny, inferência bayesiana). Não serve de base para o wizard; relevante para a frente 4. Leitura das páginas bloqueada por IP; fica para confirmar.
- **Riscos vistos no Confluence:** página "Funcionalidades da ferramenta de testes A/B" (espaço nexus) descreve um *motor interno* que substituiria chamadas ao DY — pode mudar a premissa "DY como motor". Página "[FRONT] SPIKE — Paralelismo de testes A/B…" cita "template de ficha de experimento" (possível referência para CFG-11).
- Ambiente: Node 26, npm 11; sem pnpm, Docker, Postgres ou corepack → **npm workspaces** + PGlite.

## Estrutura do repositório

```
faro/
  package.json (npm workspaces) · tsconfig.base.json · eslint.config.js · .prettierrc · vitest.workspace.ts · .nvmrc · .gitignore
  CLAUDE.md                                   # copiado de ~/Downloads
  docs/specs/00-contexto-geral.md, 01-simplificacao-configuracao.md, PEDIDOS.md
  docs/prototipo/faro-prototipo.html          # cópia de ~/Downloads (idêntica ao artifact FTFXpZhRkdf8HGjUXvLmg7)
  docs/specs/frente-01/PLAN.md, STATUS.md
  docs/adr/0001-stack-e-monorepo.md
  packages/contracts/   src/{domain,schemas,events,dy-sheet,index}.ts · fixtures/ · test/ · CHANGELOG.md   # Fase 0
  packages/config-core/ src/{design-gate,sample-size,duration,faro-id,status,dy-sheet,consistency}.ts · test/  # frente 1, funções puras compartilhadas web+api
  services/api/         src/server.ts · db/{schema,client,migrations} · experiments/{routes,service,repository,audit,events}.ts · experiments/jobs/dy-consistency.ts · ports/*.ts · mocks/*.ts
  apps/web/             Nuxt 4; features/configuracao como Nuxt layer (pages, components, composables, stores); shared/ui
```

`packages/config-core` é módulo novo da frente 1 (calculadora, gate e ficha precisam rodar ao vivo no front e ser revalidados na API). Registrado na ADR 0001 e no CHANGELOG como acréscimo ao mapa de propriedade.

## Etapas

Cada etapa termina com `npm test` (inclui testes de contrato), `npm run typecheck`, `npm run lint` e atualização de `docs/specs/frente-01/STATUS.md`.

### Etapa 0 — Bootstrap e Fase 0 (contracts)
1. `git init` com branch `feat/frente-01-configuracao` (sem commits sem pedido). Copiar `CLAUDE.md`, `00-` e `01-` para o repo e `faro-prototipo.html` para `docs/prototipo/`; nos specs, referenciar o protótipo também pelo caminho local (fonte de verdade de comportamento e dados das fixtures); gravar este plano em `docs/specs/frente-01/PLAN.md`; criar `STATUS.md` e `PEDIDOS.md`.
2. Monorepo: npm workspaces, TypeScript strict, Vitest, ESLint flat + Prettier, `.nvmrc`. ADR 0001 com stack e ownership de `config-core`.
3. `packages/contracts`:
   - Tipos da seção 6 exatamente com os nomes/semântica do contexto; `AudienceRule` como placeholder opaco (dono: frente 3).
   - Schemas Zod de todos os tipos (`ExperimentSchema`, `DesignSchema`, …) + tipos inferidos conferidos contra as interfaces.
   - Acréscimos (aditivos, só CHANGELOG): `FaroEvent` (união de `experiment.created`, `.design_completed`, `.configured`, `.config_divergence` com payloads), `DySheet` (blocos `{key,label,value}`), `ConfigDivergence`, `DyLink.campaignType?: 'custom_code'|'api_custom'|'recommendation'`.
   - Fixtures: `nexus.json` (Experiment legado + resultados consolidados/plataforma/MDE/diário copiados do protótipo, convertidos para `MetricResult`), `simulated.json` (testes do protótipo como `Experiment`, com os 5 cenários de borda marcados + `MetricResult` gerados por porte determinístico do gerador seedado do protótipo), `metrics-catalog.json` (lista da seção 9 da frente 1, com `baseline`/`cv` de `ROWS`), `pages.json` (tráfego diário de `PAGES`), `templates.json` (banner de home, teste de preço). E-mails só `@example.com`; nenhum dado pessoal.
   - Testes de contrato: toda fixture valida no schema; round-trip JSON; `faroId` com regex `^FARO-\d{4}-\d{4}$`.

### Etapa 1 — Modelo, persistência e `faroId` (CFG-10, CFG-01 parcial)
- Drizzle + PGlite: tabelas `experiments` (colunas-chave + `design`/`audience`/`allocation`/`overlap`/`dy` em JSONB), `faro_id_counters(year, last)`, `experiment_audit`, `domain_events` (outbox), `metric_requests`.
- `faroId` gerado no primeiro save via upsert atômico no contador do ano (`FARO-AAAA-NNNN`, imutável — PATCH que tente alterar retorna 400).
- Rotas Fastify (validação Zod na borda): `POST /experiments`, `GET /experiments/:faroId`, `PATCH /experiments/:faroId` (autosave parcial).
- Identidade: header `x-faro-user` (DECISAO-PENDENTE até SSO). Evento `experiment.created` no outbox.

### Etapa 2 — Etapa Design com gate (CFG-02 a CFG-06)
- `config-core/design-gate.ts`: checklist com cada regra isolada — nome ≥ 4, BU, squad, contexto ≥ 60, hipótese com `change`/`expectedEffect`/`because` preenchidos, controle + ≥ 1 variante descritos, exatamente 1 primária, ≥ 1 secundária, primária ∉ secundárias, MDE > 0, Figma opcional válido (`https://(*.)figma.com/…`). Mensagens dizem o que corrigir.
- `config-core/status.ts`: `rascunho ⇄ design_completo` recalculado a cada save; evento `experiment.design_completed` na primeira transição.
- Front: wizard com stepper acessível (etapas 2–4 bloqueadas até o gate), autosave com debounce, checklist com progresso (padrão visual do protótipo), seletores de métrica do catálogo (porta `MetricCatalogPort`, mock com fixture) com definição no hover/foco, guardrails opcionais, hipótese em 3 campos.
- CFG-05: "Criar métrica" → `MetricDefinition` `status: 'rascunho'` via porta mock + registro em `metric_requests` + pedido em `PEDIDOS.md` para a frente 4.
- CFG-06: mostra baseline/cv do catálogo para a NORTE e aceita `baselineOverride` (taxa em % na UI, fração no modelo; cv para `mean`).

### Etapa 3 — Calculadora de amostra e duração (CFG-07, CFG-08)
- `sample-size.ts`: z exatos (α = 5% bicaudal, poder 80%). Proporção `n = (z₁₋α/₂+z₁₋β)²·2p(1−p)/(p·MDE)²`; média `n = (z…)²·2·cv²/MDE²`; `ratio` tratado como média com cv (DECISAO-PENDENTE).
- `duration.ts`: duração = `ceil(n_por_grupo / (elegíveisDia × menor fração do split))` (equivale a amostra total ÷ elegíveis para split igual; para split desigual garante que o menor braço atinja `n` — DECISAO-PENDENTE). Alertas: > período (bloqueia), < 7 dias, > 42 dias.
- Testes com valores conhecidos (ex.: p = 3,2%, MDE 5% ≈ 189.943/grupo; cv = 6, MDE 5% ≈ 226.048/grupo — confirmar no teste), bordas (MDE 0, p fora de (0,1), split com 0).

### Etapa 4 — Etapas Público e Sobreposição (CFG-08, CFG-09)
- Portas consumidas da frente 3, com mocks: `estimateEligibleDaily(allocation, audience)` (tráfego por página do protótipo × plataforma × `estimatedShare` × `trafficPercent`), `listOverlaps(experiment)` (retorna conflito com o Nexus quando página `home` em android/ios).
- Etapa 2 do wizard: plataformas, páginas, descrição do público (obrigatória), atalhos, `trafficPercent`, split, datas; painel de estimativa ao vivo.
- Etapa 3: lista `OverlapDecision`; médio/alto exigem `resolution` (+ `decidedBy`/`decidedAt`) antes de liberar a revisão.

### Etapa 5 — Revisão e ficha do DY (CFG-11)
- `POST /experiments/:faroId/ready` revalida tudo (gate, allocation, viabilidade, sobreposição) → `pronto_para_configurar`.
- `config-core/dy-sheet.ts` monta `DySheet`: nome `FARO-… | nome`, labels (`faro:FARO-…`, BU, squad), tipo de campanha (sugerido pela plataforma), seletor, páginas e plataformas, regra de público (`audience.dyAttribute`), variações com nome padronizado (`FARO-…:controle`, `FARO-…:a` — DECISAO-PENDENTE com Analytics), split e controle, métrica primária equivalente no DY (mapa local até a frente 4 expor), datas. Nenhum campo livre para o operador.
- `GET /experiments/:faroId/dy-sheet` (JSON ou `?format=md`). UI: um bloco por campo com botão copiar e "Exportar Markdown".

### Etapa 6 — Confirmação e checagem D+1 (CFG-12, CFG-13, auditoria)
- `POST /experiments/:faroId/dy-confirmation` (`campaignId`, `configuredBy`, `configuredAt`) → `configurado_no_dy`, evento `experiment.configured`.
- Após `configurado_no_dy`, toda mudança de design grava `experiment_audit` (campo, antes, depois, autor, data) e continua sujeita ao gate.
- Job `npm run job:dy-consistency -- --refdate=AAAA-MM-DD` usando `DyExportPort` (mock com fixture; adaptador real futuro consultará BigQuery sempre com intervalo fechado de `refdate`). Compara variações, nomes, split (±2 p.p.) e plataformas → `ConfigDivergence` + evento `experiment.config_divergence` para o painel (frente 2).

### Etapa 7 — Legado e duplicação (CFG-14, CFG-15)
- `POST /experiments/import-legacy` (`dyCampaignId`): cria `Experiment` `legacy: true`, novo `faroId`, preenche o que o export traz, status `configurado_no_dy` (frente 2 promove a `rodando`), design exibido como "não registrado" até passar no gate. Validar com a fixture do Nexus.
- `POST /experiments/:faroId/duplicate`: novo rascunho, novo `faroId`, limpa datas, `dy`, `decision`, `overlap`; `legacy: false`.

### Etapa 8 — Export do DY real (BigQuery, últimos 6 meses) — proposta de 14/10/2026

Substitui o mock `mocks/dy-export.ts` por dados reais da DY para a importação de legados (CFG-14) e a checagem D+1 (CFG-13), lendo os últimos 6 meses. O dado é da frente 4 (registrar em `PEDIDOS.md` que este adaptador é interino até ela assumir).

**Arquitetura: job de sincronização + adaptador de arquivo** (a API não fala com o BigQuery em runtime; dev sem credenciais continua funcionando com o mock):

1. **Job `npm run job:sync-dy -- --meses=6`** (`services/api/src/jobs/sync-dy-campaigns.ts`), com `@google-cloud/bigquery` (ADC) e consultas sempre com `refdate BETWEEN` fechado:
   - **Campanhas** — `petlove-dataeng-prod-01.ssot_dynamic_yield.variation_engagement`, janela de 6 meses: `campaign_id`, `campaign_name`, variações distintas, `firstSeen` (MIN refdate na janela), `observedSplit` (share de `dyid` únicos por variação, últimos 14 dias), páginas top 3 por `url_clean`.
   - **Plataformas** — `daily_activity_stream` (`event_type = 'VARIATION_ENGAGEMENT'`, últimos 7 dias, só colunas `campaign_id`, `device`, `operating_system`): mapeia para `site`/`android`/`ios`; sem dado → `['site']` com `// DECISAO-PENDENTE`.
   - **Snapshots D+1** — users por variação por refdate (últimos 14 dias), para `getSnapshot`.
   - Grava `services/api/.data/dy-campaigns.json` (sem PII: só ids, nomes e contagens).
2. **Adaptador `adapters/dy-export-file.ts`** implementando `DyExportPort` a partir do JSON; `defaultPorts` usa o arquivo quando existe, senão o mock. Testes seguem no mock.
3. **Listagem para a UI** — acréscimo aditivo `listCampaigns()` ao `DyExportPort` (port é da frente 1): a importação de legado vira um select de campanhas reais em vez de digitar o `dyCampaignId`.

**Riscos/limites:** labels não existem no export (ficam `[]`); % de tráfego continua 100% (DECISAO-PENDENTE 9); plataformas inferidas, não declaradas; o JSON envelhece — rodar o sync antes da checagem D+1.

### Etapa 9 — Ajustes de produto de 15/10 (feedback de Marina Bonafé, canal de revisão do wizard)

Sete pedidos sobre o wizard, implementados sem mudar o fluxo de quatro etapas:

| # | Pedido | Onde | Como |
|---|---|---|---|
| 1 | Métrica criada entra selecionada na hora | `CfgStepDesign.vue`, `CfgMetricPicker.vue` | A métrica recém-criada vira a NORTE (ou entra nos guardrails) e o dropdown muda para a área dela |
| 2 | Criar métrica também nos guardrails | `CfgStepDesign.vue`; `catalog/routes.ts` aceita a área Retenção | Mesmo formulário (CFG-05), com a área escolhida no picker |
| 3 | Páginas mais precisas (URL ou caminho do app) | `contracts` (`PageTarget`, `Allocation.pageTargets`), `dy-sheet.ts`, `CfgStepAudience.vue`, `CfgStepReview.vue` | Por página escolhida: URL no site e rota/tela no app, opcionais; vão para o bloco "Páginas" da ficha do DY. O catálogo pode trazer valores canônicos (`PageCatalogEntry.urlPattern/appPath`, pedido à frente 3) |
| 4 | Públicos pré-segmentados, com a origem | `contracts` (`AudienceOrigin`), `fixtures/audiences.json`, `CfgStepAudience.vue` | Atalhos agrupados por origem (BigQuery, Faro, DY) com a fonte visível, e formulário "usar público já criado no DY" (nome + atributo + % da base → `Audience.dyAttribute`) |
| 5 | Sugestão de datas com os testes interpostos | `config-core/suggest-dates.ts`, `GET /experiments/:id/date-suggestion`, `CfgStepAudience.vue` | Período = duração mínima (CFG-08) em semanas inteiras a partir de amanhã; lista testes ativos/agendados nas mesmas páginas e plataformas e a próxima janela livre |
| 6 | MDE sugerido pela base histórica | `config-core/suggest-mde.ts`, `GET /experiments/:id/mde-suggestion`, `CfgStepDesign.vue` | Testes com a mesma NORTE (dataset da frente 4): mediana do efeito observado, arredondada a 0,5 p.p., com os mais parecidos (página, BU, plataforma) listados |
| 7 | Confirmação no DY faseada | `CfgDySheet.vue`, `CfgStepReview.vue` | 1) copiar/exportar a ficha → 2) declarar que colou no console → 3) só então o formulário de confirmação (CFG-12). Progresso guardado no navegador por `faroId` |

Verificação: testes unitários das duas funções novas e da ficha com alvo de página; testes de API dos dois endpoints, da persistência de `pageTargets` e da área Retenção; fluxo no navegador.

## Contratos

- **Expõe:** `Experiment` (`design`, `allocation`, `dy`), endpoint da ficha do DY, eventos `experiment.created`, `.design_completed`, `.configured`, `.config_divergence`.
- **Consome (mock até existir):** `MetricDefinition` + baseline (frente 4), `Audience`, `estimateEligibleDaily`, `OverlapDecision` (frente 3), `Template` (frente 5).
- **`PEDIDOS.md`:** frente 4 — endpoint de criação de métrica rascunho, campo de equivalência com métrica primária do DY, snapshot do export DY por campanha/refdate; frente 3 — `estimateEligibleDaily`, provedor de sobreposição, `dyAttribute`, definição de `AudienceRule`; frente 5 — tipo `Template`; frente 2 — consumo de `config_divergence` e transição para `rodando`.

## DECISAO-PENDENTE (opção conservadora, marcada no código)

1. Tipos de campanha DY e campos por tipo (pergunta aberta 1).
2. DY espelha split e métrica primária na ficha; o Faro decide pela NORTE (pergunta 2).
3. Sem etapa de aprovação humana do design; só o gate automático (pergunta 3).
4. Split desigual: menor braço precisa atingir `n`.
5. `kind: 'ratio'` calculado como média com cv.
6. Sequência do `faroId` reinicia a cada ano.
7. Convenção de nomes de variação no DY.
8. Legado importado entra como `configurado_no_dy`.
9. Identidade por header até SSO.
10. Mapa local métrica Faro → métrica primária DY até a frente 4.

## Riscos

- Iniciativa de motor interno (Confluence nexus) pode substituir o DY como motor; afetaria ficha e checagem D+1.
- Convenção da seção 7 ainda não validada com Analytics.
- Specs 02–05 não estão disponíveis localmente; contratos derivados só do `00`.
- Node 26 é recente: fixar versões de Nuxt/PGlite e, se houver incompatibilidade, registrar em STATUS.
- Sem auth real nesta entrega.

## Verificação

- `npm test`: unitários de `config-core` (calculadora com valores conhecidos, cada regra do gate isolada, transições de status, montagem da ficha), snapshot da ficha (Markdown e JSON), testes de contrato de todas as fixtures, testes de API com `fastify.inject` + PGlite em memória (inclui 20 criações concorrentes → `faroId` únicos e sequenciais; PATCH tentando mudar `faroId` → 400; auditoria após configuração).
- `npm run typecheck` e `npm run lint` limpos.
- Ponta a ponta no browser pane (`preview_start` com web + API): criar do zero e a partir de template → gate libera etapas → público com home no app gera conflito com o Nexus → resolver → revisão → copiar blocos e exportar Markdown → confirmar campanha → status `configurado_no_dy`; rodar o job D+1 com fixture divergente → evento de divergência; importar o Nexus como legado; duplicar; navegação só por teclado.
