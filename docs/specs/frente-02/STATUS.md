# Frente 2 — STATUS

Atualizado em 2026-10-15.

## Pronto

| Etapa                            | Requisitos                | Onde                                                                                                                                                                                                               | Testes                                                                                                                                              |
| -------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 0                           | contratos v0.1.0 → v0.2.0 | `packages/contracts`                                                                                                                                                                                               | 47 (schemas, invariantes, fixtures, histórico coerente com status, `labelFor`, `figmaUrl` só https)                                                 |
| 1. Lista, filtros e busca        | PNL-01, PNL-02, PNL-03    | `apps/web/features/painel`, `apps/web/pages/painel/index.vue`, `GET /api/painel`                                                                                                                                   | 31 (BU incl. ecossistema, cada filtro, busca, ordenação por coluna, URL ida e volta, 200 itens < 50 ms)                                             |
| 2. Máquina de estados            | PNL-04                    | `services/api/experiments/status`                                                                                                                                                                                  | 81 (matriz 8×8, derivação de `rodando`, decisão, permissões, histórico das fixtures só com transições válidas)                                      |
| 3. Detalhe + linha do tempo      | PNL-05, PNL-11            | `apps/web/pages/painel/[faroId].vue`, `features/painel/components/detalhe`, `GET /api/experiments/:faroId`, `services/api/experiments/governance/design.ts`                                                        | 18 (tags do cabeçalho, NORTE por plataforma, contaminação, formatação, timeline e fuso) + 4 (`missingDesignFields`)                                 |
| 4. Mapa temporal                 | PNL-06                    | `apps/web/pages/painel/mapa.vue`, `features/painel/components/PainelMapa.vue`, `features/painel/domain/time-map.ts`                                                                                                | 17 (janela e régua, linha de hoje, sub-linhas, planejado, contorno por sobreposição na mesma página, esmaecimento por BU)                           |
| 5. Governança + notificações     | PNL-08, PNL-13            | `services/api/experiments/governance` (`rules.ts`, `notifications.ts`), ligado em `server/utils/fixtures.ts`                                                                                                       | 44 (positivo e negativo por regra, órfãs, motor sobre fixtures, diff de alertas, roteamento e envio com falha parcial)                              |
| 6. Órfãs, decisão e encerramento | PNL-07, PNL-09, PNL-10    | `pages/painel/orfas.vue`, `components/detalhe/ExperimentoAcoes.vue`, `POST /api/experiments/:faroId/decision` e `/close`, `GET /api/dy-campaigns/orphans`, `services/api/experiments/status/{commands,closing}.ts` | 23 (checklist: DY confirmado pelo export D+1, link só https; comandos: entrada não confiável, autor vem do ator, permissão, transição)              |
| 7. Capacidade                    | PNL-12                    | `pages/painel/capacidade.vue`, `features/painel/domain/capacity.ts`                                                                                                                                                | 19 (ocupação = tráfego × público, exclusão mútua soma, independentes 1 − Π(1 − x), status que ocupam, chegando em 30 dias, sem dado por plataforma) |

Validação manual no navegador (dev server):

- Lista: filtro de BU Saúde mostra Saúde + Nexus; ordenação NORTE desc; busca e toggles refletidos na URL; SSR abrindo direto com query; `/` redireciona para `/painel`.
- Detalhe do Nexus: tags (split 2% × 98%, contaminação 26.016 (2,3%), sobreposição alta sem decisão), decisão, design com campos faltantes, NORTE consolidada/Android/iOS igual ao export, histórico com autor e horário de São Paulo.
- Etapa 6 (API e tela): decisão do FARO-2026-0003 pela tela leva a Decidido, grava autor e data do ator e mostra o checklist; `decidedBy` enviado pelo cliente é ignorado; encerrar o Nexus com DY ativo → 409 com o item pendente; link `javascript:` → 400; `faroId` inválido → 400, inexistente → 404; órfãs dy-2001 e dy-2002 listadas.
- Capacidade: Home no app 100% comprometida (Nexus decidido e ainda ativo + Onboarding Saúde); Home no site livre com 2 testes chegando; Carrinho 50% nas três plataformas.
- Estados: sem leitura (FARO-2026-0005), 404 (FARO-2026-9999) e `faroId` inválido (400).
- Mapa: 7 páginas na visão Ecossistema; com Saúde, só Home e Área Saúde, com Ecom e Serviços esmaecidos e nomeados; contorno alto sem decisão (Nexus × Onboarding) e resolvido (0005 × 0008); `?bu` preservado ao alternar Lista/Mapa.
- 375 px sem rolagem horizontal da página em todas as telas (tabelas e mapa rolam dentro do quadro); console sem erros.

## Mockado

- Experimentos, NORTE, catálogos e histórico: fixtures de `packages/contracts` via `server/utils/fixtures.ts` (pedidos 1, 4, 5, 10).
- Alertas: saem do motor de governança sobre as fixtures; persistência entre cargas (`diffAlerts`) e envio real das notificações ainda não estão ligados a um job.
- Indicadores de saúde (SRM, amostra planejada, contaminação): `fixtures/experiment-health.json` (pedido 9).
- Divergência de configuração (CFG-13): regra pronta, sem dado da frente 1 (pedido 2).
- Identidade: sem autenticação. Escrita só em `nuxt dev` com `runtimeConfig.devActor` (padrão: time de experimentação); em produção, 401 (pedido 13).
- Estado: decisões e encerramentos ficam em memória no servidor e somem ao reiniciar (pedido 14).
- Importar campanha órfã como legado: botão desabilitado até a CFG-14 da frente 1 (pedido 3).
- Template de decisão: `features/painel/mocks/decision-template.ts` (pedido 7).

## Decisões conservadoras (`DECISAO-PENDENTE`)

- Encerrar exige o checklist completo; "campanha desligada" só vale confirmada pelo export (inativa e sem exposição depois do dia da decisão, em export posterior à decisão).
- Escrita falha fechada sem autenticação (401).

- Dono de alertas sem squad (órfãs): alias fictício do time de experimentação (`server/utils/fixtures.ts`).
- Teste `ecossistema` notifica o canal configurado para `ecossistema`, senão o canal padrão.
- Limiares: SRM p < 0,001 (contexto); split extremo ≥ 95%; sem exposição 2 dias após max(início, configuração); decidido ativo vira crítico após 7 dias (meta do spec).

- Teste `ecossistema`: só o time de experimentação muda status (`services/api/experiments/status/transitions.ts`).
- `decidido` não vai para `cancelado`; só para `encerrado`.

## Pendências e bloqueios

- Achado: o Nexus acusa SRM pelas contagens consolidadas (p ≈ 1,4e-12 contra 2% × 98%). Repassado à frente 4.
- Job diário (após a carga D-1) que roda o motor, aplica `diffAlerts`, persiste e despacha notificações: depende de infraestrutura e credenciais (pedidos 11 e 12).

- Mapa: "hoje" = D-1 + 1 (determinístico entre SSR e navegador); janela usa `de`/`ate` da URL, mas ainda sem controle na tela.

- Filtros de squad, plataforma e página aceitam múltiplos valores na URL, mas a UI escolhe um por vez.
- Detalhe inexistente responde HTTP 200 com mensagem de "não encontrado" (a API responde 404).
- Ambiente: Node 22 em `~/.local/node` (sem sudo). Para rodar: `export PATH=$HOME/.local/node/bin:$PATH`.

## Próximas etapas

As 7 etapas do plano estão entregues sobre mocks. O que falta depende de outras frentes ou da plataforma (ver `docs/specs/PEDIDOS.md`): autenticação, persistência, job diário de governança com envio real, CFG-13/CFG-14, `ExperimentHealth` e catálogo de páginas reais.
