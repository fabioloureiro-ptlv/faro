# Frente 4 — Unificação de métricas

> Leia antes: `00-contexto-geral.md`. Este arquivo descreve apenas o que é específico desta frente.

## 1. Requisito

Integrar dados de engajamento (cliques e visualizações) com métricas finais de negócio (conversão, receita por visitante, inadimplência, retenção e CSAT) em uma única visualização.

## 2. Problema hoje

O relatório do DY mostra engajamento e algumas conversões, mas não inadimplência, retenção ou CSAT. O visualizador atual já calcula métricas de eCom, Clube e Saúde a partir do export do DY, mas cada nova métrica depende de trabalho manual, e outros times calculam as mesmas métricas de jeitos diferentes (há divergência documentada entre GA4 e banco no funil de pagamentos).

## 3. Objetivo da frente

1. Um **catálogo de métricas** versionado: cada métrica tem definição, SQL, dono, direção e parâmetros estatísticos.
2. Uma **camada de exposição** confiável: quem viu qual variante, quando, excluindo contaminação.
3. Um **motor estatístico** único que produz `MetricResult` com os mesmos rótulos do visualizador atual.
4. Um **relatório único** por experimento, juntando engajamento e negócio, consolidado e por plataforma, no formato definido pela frente 5.

## 4. Escopo

**Dentro:** catálogo de métricas, ingestão do Daily Activity Stream do DY, modelo de exposição, modelos SQL das métricas, integração das fontes de negócio, motor estatístico, tabela de resultados, API de resultados, UI de resultados (layout vindo da frente 5), detectabilidade (MDE), saúde do teste.

**Fora:** escolha de métricas no cadastro (frente 1), estrutura e textos do relatório (frente 5), sobreposição entre testes (frente 3; esta frente fornece as exposições).

## 5. Camadas de dados

```
DY Daily Activity Stream (S3, 30 dias) ──► raw_dy_activity (BigQuery, histórico completo)
GA4 (ssot_ga4: events, event_params, items) ──┐
Banco transacional / Fintech / Saúde / CSAT ──┤
                                              ▼
exposures      — 1 linha por usuário × experimento: variante, primeira exposição, plataforma, contaminado?
metric_events  — eventos de negócio por usuário e data (compra, receita, cancelamento, inadimplência, nota CSAT…)
                                              ▼
metric_values  — valor por usuário × experimento × métrica, só eventos após a primeira exposição
                                              ▼
metric_results — agregados por variante × plataforma × grão + estatística (MetricResult)
```

Regras da camada de exposição:

- Fonte primária: Daily Activity Stream (impressões por campanha e variação). Fallback: `ssot_ga4.event_params` com `key = 'variationName'` (ou `experiment_id` quando a convenção do contexto existir).
- Vínculo com o experimento pelo label `faro:` da campanha ou, para legados, pelo nome da campanha.
- Usuário exposto a mais de uma variante: `contaminado = true`, excluído e contado no relatório.
- Janela de leitura configurável por experimento (ex.: Nexus lê de 31/08 a 12/10, excluindo dias de split instável).
- Identidade: usar o identificador unificado (GUID) quando disponível para ligar DY, GA4 e banco; documentar a taxa de casamento.

## 6. Catálogo inicial de métricas

| Seção | Métricas | Fonte provável |
|---|---|---|
| Engajamento | Impressões, CTR da variação, cliques por usuário | DY Activity Stream |
| eCom | Receita por usuário (NORTE padrão), conversão, transações por usuário, ticket médio, receita faturada por usuário, margem 2 por usuário, conversão para o carrinho, conversão em Repet nova | GA4 + banco (receita faturada e margem só no banco) |
| Clube | Conversão no clube, receita do clube por usuário, churn do clube | Banco |
| Saúde | Conversão em saúde, vidas por usuário, receita de saúde por usuário, ticket de saúde, churn de saúde | Banco de Saúde |
| Fintech | Inadimplência (definição a fechar: % de usuários com parcela vencida há mais de N dias), uso de cashback | **A descobrir** |
| Retenção | Retenção em 30/60/90 dias, recompra | Banco |
| Atendimento | CSAT médio, chamados por usuário | **A descobrir** |
| Operação | Tempo de carregamento, taxa de erro | GA4 / observabilidade |

Métricas com efeito tardio (inadimplência, retenção) têm `maturationDays`: o relatório mostra "ainda maturando" até a janela fechar.

## 7. Requisitos funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| MET-01 | Catálogo de métricas | Cada `MetricDefinition` com SQL versionado em `data/models/metrics`, dono, direção, unidade, grãos, baseline e `cv`, registrada no Catálogo de Dados |
| MET-02 | Publicar métrica criada no cadastro | Fila de métricas em `rascunho` (CFG-05) com fluxo de revisão; ao publicar, vira `ativa` |
| MET-03 | Ingestão do Activity Stream | Job diário copia o export do S3 para o BigQuery com histórico completo; alerta se o arquivo do dia não chegar |
| MET-04 | Modelo de exposição | Tabela `exposures` conforme seção 5, com testes de qualidade (unicidade, contaminação, cobertura por plataforma) |
| MET-05 | Métricas por usuário e por sessão | `metric_values` nos dois grãos quando a métrica suportar; grão usuário é o padrão de decisão |
| MET-06 | Motor estatístico | Proporções: teste z de duas proporções. Médias e razões: aproximação normal com variância por delta method. Saída: valor por variante, delta relativo, IC 95%, `probBetter` (invertida para `lower_better`), rótulo de significância conforme o contexto |
| MET-07 | Volumes | Usuários, compradores, transações e receita por variante, consolidados e por plataforma |
| MET-08 | SRM e contaminação | Qui-quadrado sobre o split planejado; dias com split instável; usuários contaminados (n e %) |
| MET-09 | Detectabilidade | MDE atual por métrica com a amostra coletada; comparação com o MDE do design |
| MET-10 | Amostra e parada | Progresso da amostra planejada para a NORTE e alerta de significância antes da amostra |
| MET-11 | Saúde do teste | Série diária de expostos por variante e da NORTE por variante, por plataforma |
| MET-12 | Recomendação ("o que fazer") | Regras sobre os resultados: investigar SRM; avaliar guardrail piorado; implementar (NORTE confirmada e amostra completa); manter rodando; desligar variante; encerrar sem vencedor; desligar campanha quando uma variante já tem ~100% do tráfego |
| MET-13 | Síntese | Frase com a NORTE e até três métricas mais relevantes (confirmadas ou em queda), no formato do visualizador atual |
| MET-14 | API de resultados | `GET /results/{faroId}?grain=&platform=` retorna `MetricResult[]`, volumes, saúde do teste, MDE, recomendação e síntese |
| MET-15 | UI de resultados | Implementa o template de relatório da frente 5: cabeçalho com tags, design no topo, variantes com split, síntese, "o que fazer", tabela por seção com NORTE/GUARDA/SECUNDÁRIA, alternância usuário/sessão e consolidado/plataforma, saúde do teste, detectabilidade, "como os números são calculados" |
| MET-16 | Linhagem | Cada número do relatório indica a tabela de origem e o SQL usado (seção "Fonte dos dados") |
| MET-17 | Paridade com o visualizador | Para o Nexus, os números do Faro batem com o export de 13/10 (tolerância de 0,5% nos valores; deltas conforme o método do visualizador, que deve ser documentado) |

## 8. Requisitos não funcionais

- Resultados atualizados diariamente até 10h com dados D-1.
- Custo de processamento por experimento por dia documentado e monitorado.
- Testes de qualidade no Catálogo de Dados para `exposures` e `metric_values`.
- O motor estatístico é uma biblioteca pura (`packages/stats`) com 100% dos casos de rótulo cobertos por testes.

## 9. Contratos

**Expõe:** `MetricDefinition`, `MetricResult`, tabela `exposures` (para a frente 3), API de resultados, indicadores de SRM, amostra e recomendação (para a frente 2).

**Consome:** `Experiment` (design, alocação, janela de leitura), templates de relatório e de métricas por tipo de teste (frente 5).

## 10. Mocks para trabalhar em paralelo

- `fixtures/nexus.json` com os valores reais (consolidado, Android, iOS, MDE, saúde do teste) para desenvolver a UI e validar paridade.
- Gerador de dados sintéticos por usuário (seedado) para testar o motor estatístico e os casos de borda (SRM, parada antecipada, guardrail piorado).

## 11. Plano sugerido

1. `packages/stats` com testes contra casos conhecidos e contra o Nexus.
2. Catálogo de métricas (estrutura, 10 métricas de eCom e Clube já usadas pelo visualizador).
3. Ingestão do Activity Stream e modelo `exposures`.
4. `metric_values` e `metric_results` para eCom; paridade com o Nexus (MET-17).
5. API e UI de resultados sobre o template da frente 5.
6. Fontes de Saúde, Fintech (inadimplência), retenção e CSAT, uma por vez, com dono de cada definição.
7. Recomendação, síntese e linhagem.

## 12. Como validar

- **Testes automatizados:** rótulos de significância nos limites (79,9%, 80%, 95%, 5%, 20%); inversão para `lower_better`; SRM com casos conhecidos; exclusão de contaminados; eventos antes da exposição não contam.
- **Validação de dados:** paridade com o visualizador para o Nexus e mais dois testes reais; reconciliação de receita com o financeiro para um mês.
- **Teste com usuários:** analistas de 3 BUs leem um relatório e respondem "o que fazer" sem ajuda; medir concordância com a recomendação.
- **Métricas de sucesso do requisito:** percentual de testes com ao menos uma métrica de negócio além de conversão; tempo entre fim do teste e decisão; número de métricas do catálogo com dono e SQL publicados.

## 13. Perguntas em aberto

- Os deltas do visualizador atual não são a razão simples dos valores exibidos (ex.: receita por usuário R$ 21,83 → R$ 88,20 aparece como +108,1%). Qual o método: janela de leitura, ajuste por covariável (CUPED) ou outro? Precisa ser documentado antes da paridade.
- Onde estão inadimplência (Fintech), CSAT e churn de saúde, e quem são os donos das definições?
- O identificador unificado (GUID) já está disponível no DY e no GA4 para os testes de app?
