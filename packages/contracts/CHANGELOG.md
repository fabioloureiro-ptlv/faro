# Changelog — packages/contracts

Protocolo: docs/specs/00-contexto-geral.md, seção 9. Toda mudança registra o quê, por quê e frentes afetadas. Mudança incompatível exige ADR em `docs/adr/`.

## 0.4.0 — 2026-10-15 (E8, fonte real via consultas do roadmap v3, frente 4)

**O quê**

- `MetricResult.role?` (`'norte' | 'guarda' | 'exploratoria'`, de `papel_<m>`), `confirmed?` (`confirmado_<m>`), `cuped?` (`cuped_<m>`), `minEvents?` (`eventos_min_<m>`) e `bayes?` (`MetricBayes`: `uplift_esperado_`, `chance_melhor_`, `perda_ligar_`, `perda_manter_`, `recomendacao_`).
- `ResultsResponse.source` (`'roadmap' | 'fixtures'`) — **obrigatório**: quem monta a resposta diz de onde vieram os números. As fixtures (`nexus-results.json` e `simulados/*.json`) ganharam `"source": "fixtures"` e o schema exige o campo; é o único acréscimo não opcional.
- `ResultsResponse.readWindow.origin?` (`'roadmap' | 'detectado' | 'periodo_inteiro'`, de `origem_datas`), `status?` (o `status` da linha na consulta) e `guardrailsWorse?` (`guardas_piora`, como `metricId`).
- `Allocation.readWindow?: ReadWindow` (`start`, `end`, `excludedDays?`) — janela de leitura do teste, que o sync injeta no marcador `-- {overrides}`; atende em parte o pedido 14/10 da frente 4 à frente 1 (o wizard ainda não preenche).
- `roadmap-map.ts`: `ROADMAP_METRIC_TO_FARO` / `FARO_METRIC_TO_ROADMAP` (nome da métrica no SQL ↔ `metricId` do catálogo; `margem2_por_unidade → margem_2_por_usuario`), `ROADMAP_METRICS`, `ROADMAP_STAT_PREFIXES`, `ROADMAP_SQL_VERSION`, `ROADMAP_SQL_REF`, `ROADMAP_SOURCE_TABLES`.

**Por quê**

- E8 (plano aprovado em 15/10): `GET /results/:faroId` passa a devolver o `ResultsResponse` do contrato a partir do snapshot das consultas do roadmap (`dy_results` v3, `dy_discovery`, `dy_daily` v3) com o cadastro do Faro injetado, mantendo as fixtures como alternativa (`FARO_SOURCE`).

**Compatibilidade**

- Aditivo, exceto `ResultsResponse.source`, agora obrigatório. Quem monta `ResultsResponse` fora deste pacote precisa preenchê-lo. Sem ADR: o único produtor é a frente 4 (API) e as fixtures foram atualizadas aqui.

**Frentes afetadas**

- 4 (produz), 2 (lê `ResultsResponse` e a NORTE real no painel), 5 (o template pode exibir `bayes`/`role`), 1 (`Allocation.readWindow` opcional; nada muda no wizard).

## 0.3.0 — 2026-10-15 (ajustes de produto do wizard, frente 1)

**O quê**

- `PageTarget` e `Allocation.pageTargets?` — URL (site) e caminho (app) por página escolhida. A ficha do DY passa a levar o alvo exato de cada página.
- `PageCatalogEntry.urlPattern?` / `appPath?` — valores canônicos por página do catálogo, pré-preenchidos no wizard quando existirem (dono: frente 3; ver `PEDIDOS.md`).
- `AudienceOrigin` e `AudienceShortcut.origin?` — de onde o público pré-segmentado vem (`bigquery`, `dy`, `faro`, `manual`) com rótulo para a UI. Fixture `audiences.json` anotada.

**Por quê**

- Feedback de produto de 15/10 (Marina): páginas mais precisas (URL ou caminho do app), públicos pré-segmentados com a origem visível.

**Compatibilidade**

- Aditivo: todos os campos são opcionais. Experimentos e fixtures existentes continuam válidos.

**Frentes afetadas**

- 1 (produz e consome), 3 (dona do catálogo de páginas e dos atalhos), 2 (lê `Allocation`).

## 0.2.0 — 2026-10-15 (unificação frentes 1 + 2)

**O quê**

- Incorporados os contratos do repo da frente 2 (linhagem 0.1.0→0.5.0 dela), em `src/governance.ts`:
  - `labelFor(probBetter)` — regra única do rótulo de significância.
  - `GovernanceAlert` + `GOVERNANCE_RULES` (PNL-08).
  - `ExperimentHealth` (proposta da frente 2; dono: frente 4) + fixture `experiment-health.json`.
  - `DyCampaignStatus` — situação de campanha no export para órfãs (PNL-07). **Renomeado**: era `DyCampaignSnapshot` na frente 2, que colide com o `DyCampaignSnapshot` (variações × refdate) do config-core. Ver ADR 0002.
  - União `ExperimentAuditEvent` (linha do tempo, PNL-11): created, status_changed, decided, design_changed, allocation_changed.
- `Decision.learningUrl?` (https) — checklist de encerramento (PNL-10).
- Fixtures copiadas da frente 2: `experiments.json` (11 experimentos do protótipo), `metric-results.json`, `experiment-health.json`, `audit-events.json`.

**Por quê**

- Unificação dos repositórios em um único Faro (PLANO-UNIFICACAO-FARO). O painel (frente 2) consome esses contratos.

**Compatibilidade**

- Aditivo sobre a linhagem da frente 1. Para código vindo da frente 2: renomear `DyCampaignSnapshot` → `DyCampaignStatus` (ADR 0002).

**Frentes afetadas**

- 2 (consome tudo), 4 (dona de `ExperimentHealth`/`MetricResult`), 1 (produz eventos da linha do tempo).

## 0.1.0 â€” 2026-10-14 (Fase 0)

**O quÃª**
- Tipos da seÃ§Ã£o 6 (`Experiment`, `Design`, `Audience`, `Allocation`, `DyLink`, `MetricDefinition`, `MetricResult`, `OverlapDecision`, `Decision`, `SignificanceLabel`) e schemas Zod equivalentes (teste de tipo garante paridade).
- `AudienceRule` como placeholder opaco (`Record<string, unknown>`) atÃ© a frente 3 definir a estrutura.
- AcrÃ©scimos (frente 1, compatÃ­veis):
  - `DyLink.campaignType?: 'custom_code' | 'api_custom' | 'recommendation'` â€” a ficha do DY precisa do tipo de campanha (CFG-11).
  - `ConfigDivergence` â€” saÃ­da da checagem D+1 (CFG-13), consumida pelo painel (frente 2).
  - `FaroEvent` â€” uniÃ£o de `experiment.created`, `experiment.design_completed`, `experiment.configured`, `experiment.config_divergence`, com payloads.
  - `DySheet` / `DySheetBlock` â€” ficha de configuraÃ§Ã£o do DY (CFG-11).
  - Formas provisÃ³rias de fixtures de apoio: `PageCatalog`, `AudienceShortcut` (dono: frente 3) e `Template` (dono: frente 5). Ver `docs/specs/PEDIDOS.md`.
- Fixtures (`fixtures/`): `nexus.json` (export do DY de 13/10/2026), `simulated.json` (testes simulados com os 5 cenÃ¡rios de borda), `metrics-catalog.json`, `pages.json`, `audiences.json`, `templates.json`. Geradas por `scripts/build-fixtures.ts` a partir de `docs/prototipo/faro-prototipo.html`.

**Por quÃª:** Fase 0 â€” nenhuma frente comeÃ§a cÃ³digo de produto sem contratos.

**Frentes afetadas:** todas (criaÃ§Ã£o). AcrÃ©scimos de `DyLink.campaignType`, `ConfigDivergence` e eventos: frentes 1 e 2.

