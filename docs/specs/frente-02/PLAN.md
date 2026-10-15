# Faro — Fase 0 (bootstrap) + Frente 2 (Painel centralizado)

## Contexto

- `/Users/alex.costa/Desktop/Faro` está vazio (sem git, sem `packages/contracts`, sem stack). Specs estão em `~/Downloads` (`00-contexto-geral.md`, `02-painel-centralizado.md`, `CLAUDE.md`); specs 01, 03, 04, 05 não foram fornecidos.
- Repositório do visualizador A/B atual não localizado → usar a organização da seção 8 do contexto.
- Decisões do usuário: bootstrap mínimo da Fase 0 + stack **Vue 3/Nuxt 4 + Node/TS**.
- Objetivo: Frente 2 entrega a porta de entrada do Faro (lista, filtros, status, alertas, decisão) sobre fixtures, sem depender das outras frentes.

## Fase 0 — Bootstrap (pré-requisito)

1. `git init`, branch `feat/bootstrap-contracts` (nunca commit em `main`).
2. Copiar specs para `docs/specs/` e `CLAUDE.md` para a raiz. Criar `docs/specs/PEDIDOS.md`, `docs/adr/`.
3. Monorepo **pnpm workspaces** + TypeScript strict + Vitest + ESLint/Prettier.
4. `packages/contracts`:
   - `src/types.ts`: tipos da seção 6 do contexto, literais.
   - `src/governance.ts`: `GovernanceAlert` (proposta da Frente 2) + eventos `experiment.status_changed` / `experiment.decided`.
   - `src/schemas.ts`: schemas **Zod** espelhando os tipos (validação nas bordas).
   - `fixtures/nexus.json` (dados do protótipo — lidos via `Artifact read` do link FTFXpZhRkdf8HGjUXvLmg7), `fixtures/simulados.json` (5 casos de borda), `fixtures/dy-campaigns.json` (2 órfãs), `fixtures/metric-results.json`. Sem PII (e-mails fictícios `@example.com`).
   - `CHANGELOG.md` (v0.1.0: tipos iniciais + `GovernanceAlert`).
   - Testes de contrato: toda fixture valida no schema; `faroId` casa `FARO-\d{4}-\d{4}`; split soma 1; exatamente uma NORTE.

## Frente 2 — Etapas (cada uma: testes + `docs/specs/frente-02/STATUS.md`)

Arquivos de plano: `docs/specs/frente-02/PLAN.md` (cópia deste plano) e `STATUS.md`.

1. **Lista, filtros e busca (PNL-01..03)** — `apps/web/features/painel/`
   - Lógica pura em `features/painel/domain/`: `filterExperiments`, `searchExperiments`, `sortExperiments` (testes unitários; BU `ecossistema` aparece em todo filtro).
   - Página Nuxt `/painel` com tabela; filtros sincronizados com query string (`useRoute`/`useRouter`), sem PII na URL.
   - Composable `usePainel` (padrão CAL: store Pinia + composable).
2. **Máquina de estados (PNL-04)** — `services/api/experiments/status/`
   - `transition(exp, to, ctx)` pura; mapa de transições válidas; `rodando` derivado de exposição; `encerrado` exige `Decision`; `cancelado` a partir de qualquer não-terminal.
   - Testes de cada transição válida e inválida.
3. **Detalhe + linha do tempo (PNL-05, PNL-11)** — rota `/painel/[faroId]`: tags, design no topo, resumo de resultado (mock `MetricResult`), timeline de eventos de auditoria (autor/data).
4. **Mapa temporal (PNL-06)** — componente de linhas por página × tempo, linha de hoje, contorno de sobreposição (usa `overlap` do experimento; cálculo é da Frente 3), BUs cruzadas esmaecidas.
5. **Motor de governança (PNL-08) + notificações (PNL-13)** — `services/api/experiments/governance/rules/*.ts`, uma função pura por regra (`(exp, ctx) => GovernanceAlert | null`), com caso positivo e negativo. Notificação Slack atrás de interface `Notifier` com implementação mock (canal por BU = pergunta em aberto; nenhum token no código).
6. **Órfãs, decisão e encerramento (PNL-07, 09, 10)** — detecta campanhas sem label `faro:` no mock do export DY; formulário de `Decision`; checklist de encerramento. "Importar como legado" chama mock de CFG-14 (pedido em `PEDIDOS.md` para Frente 1); template de decisão mockado (Frente 5).
7. **Capacidade (PNL-12)** — agregação por página/plataforma: testes ativos e % de tráfego comprometido.

API: `services/api` em Node/TS (Nitro do Nuxt `server/api` ou serviço separado — começar com rotas Nitro lendo fixtures; trocar por persistência depois). Permissões (squad dono + time de experimentação) ficam como `// DECISAO-PENDENTE:` com guarda conservadora (nega edição sem papel).

## Mocks e pedidos a outras frentes

- Frente 1: `Experiment` completo, CFG-13 (divergência), CFG-14 (importar legado).
- Frente 3: `OverlapDecision` (só exibição).
- Frente 4: `MetricResult` NORTE, SRM, amostra planejada.
- Frente 5: template de decisão.
  Todos registrados em `docs/specs/PEDIDOS.md`.

## Riscos / perguntas em aberto

- Dados exatos do Nexus dependem de ler o protótipo; se faltar valor, marcar na fixture e no STATUS.
- Export DY traz campanhas sem tráfego? (afeta PNL-07) — mantida pergunta do spec.
- Canal Slack por BU e quem encerra teste `ecossistema` — decisão conservadora: só time de experimentação.
- Requisito "200 experimentos < 2 s": teste de performance com fixture sintética de 200 itens.

## Verificação

- `pnpm -r test` (contratos + regras + máquina de estados + filtros).
- `pnpm -r typecheck` e `pnpm -r lint`.
- `pnpm --filter web dev` + navegador interno: `/painel?bu=saude` mostra testes de Saúde + ecossistema; detalhe do Nexus mostra alertas `split_extremo`, `decidido_ativo`/`design_incompleto` (legado).
- Commits Conventional Commits por etapa; sem push/PR sem pedido.

## Escopo desta rodada

Fase 0 + etapas 1 e 2 da Frente 2; parar para revisão antes das etapas 3–7.
