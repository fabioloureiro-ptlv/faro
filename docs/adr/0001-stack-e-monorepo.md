# ADR 0001 — Stack e organização do monorepo

- **Status:** aceita
- **Data:** 2026-10-14
- **Frente:** 1 (Fase 0)

## Contexto

O repositório começou vazio. O visualizador atual de testes A/B não foi encontrado no GitHub da Petlove; o Confluence aponta para um app R/Shiny ("Shiny - Teste A/B - Hórus"), que não serve de base para o cadastro (frente 1). A seção 8 do contexto geral define a organização de pastas quando não há repositório para estender. A máquina de desenvolvimento não tem Docker nem Postgres.

## Decisão

- **Monorepo com npm workspaces** (`packages/*`, `services/*`, `apps/*`). TypeScript strict, Vitest, ESLint flat + Prettier.
- **Front:** Nuxt 4 + Vue 3 + Pinia (padrão do chapter). Cada frente é uma Nuxt layer em `apps/web/features/<frente>`.
- **API:** Fastify em `services/api`, validação Zod na borda (schemas de `@faro/contracts`).
- **Persistência:** Drizzle ORM sobre Postgres. Em dev e testes, PGlite (Postgres embutido em WASM, sem infraestrutura); em produção, Postgres gerenciado, sem mudar o código de acesso.
- **Novo módulo `packages/config-core`** (dono: frente 1): funções puras de gate de design, calculadora de amostra/duração, prontidão, ficha do DY e checagem D+1. Existe para que o front recalcule ao vivo e a API revalide com o mesmo código. Acrescenta uma linha ao mapa de propriedade da seção 8:

  | Módulo | Dono | Consome |
  |---|---|---|
  | `packages/config-core` | Frente 1 | 2, 5 |

## Consequências

- Pacotes internos são consumidos como TypeScript fonte (sem build), via `exports` apontando para `src/`.
- Trocar PGlite por Postgres real exige só a string de conexão e o driver do Drizzle.
- Sem SSO nesta fase: a API identifica o usuário pelo header `x-faro-user` (DECISAO-PENDENTE).
