# ADR 0002 — Unificação dos contratos das frentes 1 e 2

- **Data:** 2026-10-15
- **Status:** aceita

## Contexto

As frentes 1 (wizard de configuração) e 2 (painel centralizado) foram construídas em repositórios separados, cada uma com seu `packages/contracts` derivado da seção 6 do contexto geral. As formas de domínio eram equivalentes, mas cada linhagem acumulou acréscimos próprios e um conflito de nome: `DyCampaignSnapshot` significava, na frente 1 (config-core), o snapshot **de variações e usuários por refdate** usado na checagem D+1; na frente 2, a **situação da campanha no export** (ativa, última exposição, labels) usada na detecção de órfãs.

## Decisão

1. A linhagem da frente 1 é a base do pacote unificado (schemas Zod completos + fixtures + eventos de outbox).
2. Os acréscimos da frente 2 entram em `src/governance.ts`: `labelFor`, `GovernanceAlert`, `ExperimentHealth`, união `ExperimentAuditEvent` e `Decision.learningUrl`.
3. O tipo da frente 2 é **renomeado** para `DyCampaignStatus`; `DyCampaignSnapshot` segue sendo o tipo do config-core. Código portado da frente 2 é ajustado na migração.
4. Eventos: a frente 1 mantém o modelo de outbox (`FaroEvent`, com `payload`); a linha do tempo do painel consome a união `ExperimentAuditEvent`, produzida por mapeamento na API (outbox + auditoria → timeline).

## Consequências

- Mudança incompatível só para o código da frente 2 (renome), ajustado no próprio porte — nenhum consumidor externo existia.
- O painel passa a ler experimentos reais (PGlite/Postgres da frente 1) em vez de fixtures em memória; fixtures permanecem para `MetricResult`/`ExperimentHealth` até a frente 4 produzir dados reais (base: `data/models/results/dy_results.sql`).
