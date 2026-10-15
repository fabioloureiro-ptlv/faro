# Frente 1 — Simplificação da configuração

> Leia antes: `00-contexto-geral.md`. Este arquivo descreve apenas o que é específico desta frente.

## 1. Requisito

Reduzir o trabalho manual e as etapas complexas na configuração inicial de testes A/B para minimizar erros operacionais.

## 2. Problema hoje

O time configura o teste direto no console do DY. Não há design registrado, a métrica primária é escolhida no próprio DY sem padrão, ninguém calcula amostra nem duração antes de começar, e erros de configuração (público errado, split errado, métrica errada) só aparecem quando o teste já está rodando, como o split instável e a contaminação de 2,3% do Nexus.

## 3. Objetivo da frente

Um fluxo guiado em quatro etapas (Design → Público → Sobreposição → Revisão) que:

- torna o design obrigatório e valida cada campo antes de liberar o resto;
- calcula amostra, duração e viabilidade automaticamente;
- gera o `faroId` e a **ficha de configuração do DY** pronta para copiar, eliminando digitação livre no console;
- confirma a configuração no DY e detecta divergências entre o que foi planejado e o que está rodando.

## 4. Escopo

**Dentro:** wizard de cadastro, gate de design, cálculo de amostra e duração, geração de `faroId`, ficha de configuração do DY, confirmação de configuração, checagem de consistência pós-configuração, edição de rascunhos, importação de testes legados (design mínimo).

**Fora (consome de outras frentes):** regras de público e motor de sobreposição (frente 3), catálogo de métricas e baseline (frente 4), templates de campanha (frente 5), lista e status de todos os testes (frente 2).

## 5. Jornadas

1. **PM cria um teste do zero:** escolhe um template (frente 5) ou começa em branco, preenche o design, define público e alocação, resolve sobreposição, revisa e recebe a ficha do DY.
2. **Operador do DY configura:** abre a ficha, copia campo a campo para o console, cola o ID da campanha de volta no Faro e confirma.
3. **Faro verifica:** no D+1, compara o que chegou no export do DY (variações, split, plataformas) com o planejado e alerta divergências.
4. **Dono de teste legado:** abre um teste importado do DY sem design (ex.: Nexus) e completa o design mínimo.

## 6. Requisitos funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| CFG-01 | Wizard em 4 etapas com navegação livre entre etapas liberadas | Etapas 2–4 bloqueadas até o design estar completo; estado salvo automaticamente como rascunho |
| CFG-02 | Gate de design | Obrigatórios: nome (≥ 4 caracteres), BU, squad, contexto com evidência (≥ 60 caracteres), hipótese no formato "se… então… porque…" (três partes estruturadas), controle e ao menos uma variante descritos, exatamente 1 métrica primária, ≥ 1 secundária, MDE > 0. Checklist visível com progresso |
| CFG-03 | Figma antes e depois | Campo opcional de URL por controle e variante, validado como `figma.com`; aparece na revisão e no relatório |
| CFG-04 | Métricas a partir do catálogo | Seletores leem `MetricDefinition` (frente 4); a primária não pode ser secundária; mostrar definição ao passar o mouse |
| CFG-05 | Métrica nova sob demanda | Botão "Criar métrica" abre formulário (nome, tipo taxa ou valor médio, como é calculada, linha de base). Cria `MetricDefinition` com `status: 'rascunho'` e abre pedido para a frente 4 publicar o SQL |
| CFG-06 | Linha de base editável | Para a NORTE, mostrar a baseline do catálogo e permitir `baselineOverride` (taxa em % ou variabilidade) |
| CFG-07 | Cálculo de amostra | Proporção: `n = (z₁₋α/₂ + z₁₋β)² · 2p(1−p) / (p·MDE)²`; média: `n = (z₁₋α/₂ + z₁₋β)² · 2·cv² / MDE²`; α = 5%, poder = 80%. Recalcula ao vivo |
| CFG-08 | Duração e viabilidade | Duração = amostra total ÷ usuários elegíveis por dia (frente 3). Alertas: duração maior que o período escolhido (bloqueia avanço), menos de 7 dias (alerta), mais de 6 semanas (alerta) |
| CFG-09 | Sobreposição no fluxo | Etapa 3 exibe `OverlapDecision` vindos da frente 3; conflitos médio e alto exigem resolução antes da revisão |
| CFG-10 | Geração de `faroId` | Formato `FARO-AAAA-NNNN`, sequencial, único, imutável, gerado ao salvar o primeiro rascunho |
| CFG-11 | Ficha de configuração do DY | Documento com um bloco por campo do console: nome da campanha (`FARO-… | nome`), labels (`faro:FARO-…`, BU, squad), tipo de campanha, seletor, páginas e plataformas, regra de público (atributo DY da frente 3), variações com nomes padronizados, split e controle, métrica primária equivalente no DY, datas. Cada bloco com botão copiar. Exportável em Markdown |
| CFG-12 | Confirmação de configuração | Operador informa ID da campanha DY, quem configurou e quando. Status vai para `configurado_no_dy` |
| CFG-13 | Checagem de consistência D+1 | Comparar export do DY com o planejado: variações existentes, nomes, split observado (tolerância ±2 p.p.), plataformas. Divergências viram alertas no painel (frente 2) |
| CFG-14 | Importar teste legado | A partir de uma campanha do DY sem `faroId`, criar `Experiment` com `legacy: true`, preencher o que o export permite e marcar o design como "não registrado" |
| CFG-15 | Duplicar teste | Criar novo rascunho a partir de um experimento existente, limpando datas, IDs do DY e decisão |

## 7. Requisitos não funcionais

- Tempo para cadastrar um teste completo com template: alvo ≤ 15 minutos.
- Nenhum campo de texto livre na ficha do DY que o operador precise inventar: tudo vem do Faro.
- Acessível por teclado; mensagens de erro dizem o que corrigir.
- Auditoria: toda mudança de design após `configurado_no_dy` fica registrada com autor e data.

## 8. Contratos

**Expõe:** `Experiment` (criação e edição de `design`, `allocation`, `dy`), endpoint de ficha do DY, eventos `experiment.created`, `experiment.design_completed`, `experiment.configured`, `experiment.config_divergence`.

**Consome:** `MetricDefinition` e baseline (frente 4), `Audience`, estimativa de elegíveis e `OverlapDecision` (frente 3), `Template` (frente 5).

## 9. Mocks para trabalhar em paralelo

- Catálogo de métricas: fixture com as métricas do visualizador atual (receita por usuário, conversão, transações por usuário, ticket médio, receita faturada, margem 2, conversão para o carrinho, conversão em Repet nova, conversão e receita do clube, churn do clube, conversão em saúde, vidas, receita de saúde).
- Público e elegíveis: função mock `estimateEligibleDaily(allocation, audience)` com tráfego diário por página do protótipo.
- Sobreposição: mock retornando o conflito com o Nexus quando a página for `home` no app.
- Templates: dois templates fixos (banner de home e teste de preço).

## 10. Plano sugerido

1. Modelo e persistência de `Experiment` em rascunho, geração de `faroId`.
2. Etapa Design com gate e checklist (CFG-02 a CFG-06).
3. Calculadora de amostra e duração como função pura testada (CFG-07, CFG-08).
4. Etapas Público e Sobreposição consumindo mocks da frente 3.
5. Revisão e ficha do DY (CFG-11).
6. Confirmação e checagem D+1 (CFG-12, CFG-13).
7. Importação de legado e duplicação (CFG-14, CFG-15).

## 11. Como validar

- **Testes automatizados:** unitários da calculadora (casos com valores conhecidos), validação do gate (cada campo obrigatório isolado), snapshot da ficha do DY, teste de contrato de `Experiment`.
- **Teste com usuários:** 3 PMs de BUs diferentes cadastram o mesmo teste. Medir tempo, número de erros e campos que geraram dúvida.
- **Métricas de sucesso do requisito:** tempo médio de configuração; percentual de testes com divergência na checagem D+1 (meta: queda de 50% em 3 meses); percentual de testes com design completo (meta: 100% dos novos).

## 12. Perguntas em aberto

- Quais tipos de campanha do DY usamos hoje (Custom Code, API Custom, Recomendação) e quais campos de cada um entram na ficha?
- O split e a métrica primária configurados no DY precisam espelhar o Faro, ou o DY fica só como motor de alocação e o Faro decide pela NORTE?
- Quem aprova o design: o próprio squad, um par de Analytics ou um rito semanal?

### Registradas durante a implementação (14/10/2026)

Cada uma segue a opção mais conservadora, marcada no código com `// DECISAO-PENDENTE:`.

| # | Pergunta | Opção adotada | Onde |
|---|---|---|---|
| 1 | Tipos de campanha e campos por tipo (pergunta 1 acima) | Tipo sugerido pela plataforma (site → Custom Code; só app → API Custom), editável na revisão; ficha com os mesmos 12 blocos para todos os tipos | `packages/config-core/src/dy-sheet.ts` |
| 2 | DY espelha split e métrica primária? (pergunta 2 acima) | Sim: a ficha leva split e uma métrica primária equivalente no DY; a decisão é do Faro pela NORTE | `packages/config-core/src/dy-sheet.ts` |
| 3 | Quem aprova o design? (pergunta 3 acima) | Sem aprovação humana; só o gate automático | — (nada implementado) |
| 4 | Com split desigual, como calcular a duração? | O menor grupo precisa atingir `n` | `packages/config-core/src/duration.ts` |
| 5 | Amostra para métrica `ratio` | Tratada como média com coeficiente de variação | `packages/config-core/src/sample-size.ts` |
| 6 | A sequência do `faroId` reinicia por ano? | Sim | `packages/config-core/src/faro-id.ts` |
| 7 | Nome das variações no DY | `FARO-AAAA-NNNN:controle`, `FARO-AAAA-NNNN:a`… (permite ler o teste por `variationName` no GA4). Validar com Analytics (seção 7 do contexto) | `packages/config-core/src/dy-sheet.ts` |
| 8 | Status de um legado importado | `configurado_no_dy`; a frente 2 promove a `rodando` | `services/api/src/experiments/service.ts` |
| 9 | % de tráfego de legado (o export não traz) | 100% | `services/api/src/experiments/service.ts` |
| 10 | Identidade do usuário | Header `x-faro-user` (front envia o valor de `runtimeConfig.public.faroUser`) até existir SSO | `services/api/src/http.ts`, `apps/web/nuxt.config.ts` |
| 11 | Sugestão de datas: quando começar e como arredondar? | Início no dia seguinte; janela em semanas inteiras (≥ 7 dias) a partir da duração mínima; "interposto" = teste ativo ou agendado nas mesmas páginas e plataformas | `packages/config-core/src/suggest-dates.ts` |
| 12 | MDE pelo histórico: qual estatística? | Mediana do \|efeito relativo\| dos testes com a mesma NORTE (variante de maior efeito), arredondada a 0,5 p.p. e limitada a 1–30%; semelhança (página, BU, plataforma) só ordena a lista | `packages/config-core/src/suggest-mde.ts` |
| 13 | Alvo de página (URL/caminho) é obrigatório? | Não: opcional e sem validação de formato; vai para a ficha quando preenchido | `packages/contracts/src/schemas.ts` (`PageTargetSchema`) |
| 14 | Público já criado no DY: como registrar? | Como `source: 'manual'` com `dyAttribute` e participação informada pelo time; a regra continua no DY | `CfgStepAudience.vue` |
| 15 | Confirmação faseada: onde guardar o progresso? | No navegador (`localStorage` por `faroId`); nada vai para a API até a confirmação | `CfgStepReview.vue` |
