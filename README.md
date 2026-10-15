# Faro

Orquestração de testes A/B da Petlove sobre o Dynamic Yield. Comece por [CLAUDE.md](CLAUDE.md) e [docs/specs/00-contexto-geral.md](docs/specs/00-contexto-geral.md). Protótipo de referência: [docs/prototipo/faro-prototipo.html](docs/prototipo/faro-prototipo.html).

## Rodar

Node 22.12+ (testado em 26).

```bash
npm install
npm run dev:api   # http://127.0.0.1:4000 — PGlite em services/api/.data, semeado com as fixtures
npm run dev:web   # http://localhost:3000/configuracao
```

## Verificar

```bash
npm test && npm run typecheck && npm run lint
```

Checagem D+1 (pare a API antes, por causa do PGlite): `npm run job:dy-consistency -- --refdate=2026-10-13`.

## Estrutura

| Pasta | O quê | Dono |
|---|---|---|
| `packages/contracts` | Tipos, schemas Zod, eventos e fixtures | todas (protocolo da seção 9) |
| `packages/config-core` | Gate, amostra/duração, prontidão, ficha do DY, checagem D+1 | Frente 1 |
| `services/api` | API Fastify + Drizzle (PGlite em dev) | Frente 1 em `experiments/` |
| `apps/web` | Nuxt 4; cada frente é uma layer em `features/` | Frente 1 em `features/configuracao` |
