# Changelog — packages/contracts

Protocolo: docs/specs/00-contexto-geral.md, seção 9. Toda mudança registra o quê, por quê e frentes afetadas. Mudança incompatível exige ADR em `docs/adr/`.

## 0.1.0 — 2026-10-14 (Fase 0)

**O quê**
- Tipos da seção 6 (`Experiment`, `Design`, `Audience`, `Allocation`, `DyLink`, `MetricDefinition`, `MetricResult`, `OverlapDecision`, `Decision`, `SignificanceLabel`) e schemas Zod equivalentes (teste de tipo garante paridade).
- `AudienceRule` como placeholder opaco (`Record<string, unknown>`) até a frente 3 definir a estrutura.
- Acréscimos (frente 1, compatíveis):
  - `DyLink.campaignType?: 'custom_code' | 'api_custom' | 'recommendation'` — a ficha do DY precisa do tipo de campanha (CFG-11).
  - `ConfigDivergence` — saída da checagem D+1 (CFG-13), consumida pelo painel (frente 2).
  - `FaroEvent` — união de `experiment.created`, `experiment.design_completed`, `experiment.configured`, `experiment.config_divergence`, com payloads.
  - `DySheet` / `DySheetBlock` — ficha de configuração do DY (CFG-11).
  - Formas provisórias de fixtures de apoio: `PageCatalog`, `AudienceShortcut` (dono: frente 3) e `Template` (dono: frente 5). Ver `docs/specs/PEDIDOS.md`.
- Fixtures (`fixtures/`): `nexus.json` (export do DY de 13/10/2026), `simulated.json` (testes simulados com os 5 cenários de borda), `metrics-catalog.json`, `pages.json`, `audiences.json`, `templates.json`. Geradas por `scripts/build-fixtures.ts` a partir de `docs/prototipo/faro-prototipo.html`.

**Por quê:** Fase 0 — nenhuma frente começa código de produto sem contratos.

**Frentes afetadas:** todas (criação). Acréscimos de `DyLink.campaignType`, `ConfigDivergence` e eventos: frentes 1 e 2.
