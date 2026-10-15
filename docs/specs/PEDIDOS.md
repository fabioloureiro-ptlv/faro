# Pedidos entre frentes

Formato: frente que pede → frente dona, o quê, por quê, mock usado até lá. Atualize o status quando atendido.

| # | De → Para | Pedido | Por quê | Mock em uso | Status |
|---|---|---|---|---|---|
| 1 | 1 → 4 | Endpoint para criar `MetricDefinition` com `status: 'rascunho'` e fila de publicação do SQL | CFG-05 (criar métrica sob demanda) | `services/api/src/mocks/metric-catalog.ts` grava em `metric_requests` e devolve a métrica rascunho | aberto |
| 2 | 1 → 4 | Campo de equivalência com a métrica primária do DY no catálogo (ex.: `dyPrimaryMetric`) | CFG-11 (ficha do DY sem texto livre) | Mapa local em `packages/config-core/src/dy-sheet.ts` | aberto |
| 3 | 1 → 4 | Snapshot do export do DY por campanha e `refdate` (variações, usuários, plataformas), sempre com intervalo fechado de `refdate` | CFG-13 (checagem D+1) e CFG-14 (importar legado) | Interino da frente 1 (etapa 8 do PLAN): `npm run job:sync-dy` lê o BigQuery (6 meses) e grava `.data/dy-campaigns.json`, servido por `adapters/dy-export-file.ts`; sem o arquivo, cai no mock. Limites: labels vazios, plataformas inferidas, % de tráfego desconhecido. A frente 4 assume o adaptador definitivo | aberto (interino da frente 1) |
| 4 | 1 → 3 | `estimateEligibleDaily(allocation, audience)` | CFG-08 (duração) | `services/api/src/mocks/audience.ts` (tráfego por página do protótipo × plataforma × público × tráfego) | aberto |
| 5 | 1 → 3 | Provedor de `OverlapDecision` para um experimento | CFG-09 | `services/api/src/mocks/overlap.ts` (regras de sobreposição do protótipo) | aberto |
| 6 | 1 → 3 | Publicação de `Audience.dyAttribute` via User Data API e estrutura de `AudienceRule` | CFG-11 (regra de público na ficha) | Mock gera `faro_publico_<atalho>` ou `faro_<faroId>` | aberto |
| 7 | 1 → 5 | Tipo `Template` definitivo em `packages/contracts` | Jornada 1 (criar a partir de template) | `TemplateSchema` provisório + `fixtures/templates.json` | aberto |
| 8 | 1 → 2 | Consumir `experiment.config_divergence` como alerta no painel e promover `configurado_no_dy` → `rodando` quando chegarem exposições | CFG-13 e CFG-14 | Eventos ficam na tabela `domain_events` (outbox) e em `GET /events` | aberto |
