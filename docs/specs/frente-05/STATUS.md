# Frente 5 — STATUS

Atualizado em 2026-10-15 (unificação).

## Pronto (MVP)

| Peça | Requisitos | Onde | Evidência |
|---|---|---|---|
| Contratos | TPL-01/05 (forma) | `contracts/src/templates.ts`: `CampaignTemplate` (versão, status, defaults, lockedFields), `ReportTemplate` (seções, copy, rótulos) | schemas Zod validando as fixtures |
| Biblioteca inicial | TPL-01 | `fixtures/campaign-templates.json` | os 8 templates da spec § 5, com NORTE/secundárias/guardrails do catálogo real de métricas, dicas de hipótese e checklist do DY |
| Aplicação no cadastro | TPL-02/03 | `services/api/src/templates/library.ts` substitui o mock de 2 templates; o wizard da frente 1 segue consumindo a mesma porta (visão `Template`) sem mudança | teste da frente 1 adaptado (teste de preço agora decide por margem 2, como manda a spec) |
| APIs | TPL-01/05 | `GET /templates` (visão aplicável), `GET /templates/full`, `GET /templates/full/:id`, `GET /report-template` | — |
| Template de relatório | TPL-05 (dados) | `fixtures/report-template.json` | estrutura das 10 seções do visualizador + textos de metodologia apontando para o dy_results.sql |

## Pendente

- UI da biblioteca com busca/filtro e "quando usar" (TPL-01) — o wizard mostra os cards; a biblioteca completa só via API.
- `lockedFields` aplicado na UI do wizard (TPL-02, parte visual).
- Governança de curadoria, versionamento por experimento gravando a versão usada, histórico (TPL-03/04).
- Templates de decisão e aprendizado unificados com o mock do painel (TPL-06/07) e exportação Markdown/Confluence (TPL-08).
- Sugestão de template no cadastro (TPL-09) e métricas de uso (TPL-10).
