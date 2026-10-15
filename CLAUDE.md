# Faro — instruções para o Claude Code

Este repositório constrói o Faro, a camada de orquestração de testes A/B da Petlove sobre o Dynamic Yield.

## Sempre, em qualquer sessão

1. Leia `docs/specs/00-contexto-geral.md` inteiro. Ele define domínio, contratos, fontes de dados, restrições e regras de trabalho em paralelo.
2. Identifique sua frente pelo pedido do usuário e leia o arquivo correspondente:
   - `docs/specs/01-simplificacao-configuracao.md`
   - `docs/specs/02-painel-centralizado.md`
   - `docs/specs/03-segmentacao-e-sobreposicao.md`
   - `docs/specs/04-unificacao-de-metricas.md`
   - `docs/specs/05-templates.md`
3. Leia `docs/specs/frente-0X/PLAN.md` e `STATUS.md` da sua frente, se existirem, e `packages/contracts/CHANGELOG.md`.

## Regras

- Comece em modo de planejamento. Escreva ou atualize `docs/specs/frente-0X/PLAN.md` e espere aprovação antes de implementar.
- Só edite os módulos da sua frente (mapa de propriedade na seção 8 do contexto). Para o resto, use mocks e registre pedidos em `docs/specs/PEDIDOS.md`.
- Mudanças em `packages/contracts` seguem o protocolo da seção 9 do contexto (changelog e, se incompatível, ADR).
- Consultas a tabelas do GA4 sempre com intervalo fechado de `refdate`.
- Nenhum dado pessoal em logs, URLs ou fixtures.
- Ao final de cada etapa: rode os testes (incluindo testes de contrato) e atualize `STATUS.md`.
- Dúvida de regra de negócio: registre em "Perguntas em aberto" da frente, siga a opção mais conservadora e marque com `// DECISAO-PENDENTE:`.
