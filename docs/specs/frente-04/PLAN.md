# Frente 4 — Unificação de métricas — PLAN

> Status: **aguardando aprovação**. Nada de produto foi implementado. Este plano foi escrito em 14/10/2026 a partir de `00-contexto-geral.md`, `04-unificacao-de-metricas.md`, do protótipo navegável do Faro e de buscas no Confluence, no Jira e nos repositórios disponíveis na sessão.

## 0. Resumo executivo

- **Não existe repositório do Faro nem do visualizador atual nesta sessão.** Os nove repositórios disponíveis (health-*, sheltie, saintbernard, bordercollie, parrot, dachshund) não contêm o visualizador. Este plano assume a organização de repositório da seção 8 do contexto e registra em PEDIDOS o acesso aos repositórios que faltam.
- **O visualizador atual foi localizado e já evoluiu.** É a aba de testes do "roadmap do Digital" (app do Virgilio), alimentada por três consultas BigQuery (`dy_results`, `dy_discovery`, `dy_daily`) mantidas por Felipe Bhering (Marketing Data). A v3 (09/10) e a v4 (13/10) já aplicam CUPED 28 dias, intervalo Agresti-Caffo, correção de Dunnett para várias variantes, Holm/BH para várias métricas, mínimo de 30 eventos / 7 dias e leitura bayesiana com perda esperada e recomendação (Jira MS-5638). O dash Shiny "Hórus" do Pelican (`apps/shiny/teste-ab`) está sendo aposentado em favor do roadmap.
- **Consequência para a frente 4:** não reconstruir estatística do zero. `packages/stats` porta o método v4 (com testes de paridade) e os modelos SQL do Faro partem das consultas v4. A pergunta em aberto sobre os deltas "que não batem com a razão simples" tem resposta provável: CUPED e a correção do controle que volta depois do rollout.
- **Risco de premissa:** o card MS-5638 abre com "Com a saída da Dynamic Yield". Há uma iniciativa de internalização da DY (MS-5639) e um motor interno de testes A/B em fase 1 no squad Nexus (Confluence "Funcionalidades da ferramenta de testes A/B"). A camada de exposição da frente 4 será desenhada com a fonte plugável (DY Activity Stream hoje, evento `experiment_exposure` no GA4 e motor interno amanhã), para que o Faro sobreviva à troca de ferramenta.
- **Dados já existentes que esta frente reaproveita:** `curated_dynamic_yield.daily_activity_stream` já é ingerida no BigQuery pelo Kraken (MET-03 fica reduzido a verificar histórico e alerta de atraso); `ssot_ga4` planificado; `op_mkt_cross.dts_churn_teste_ab`; "Dataset | Teste A/B" (dw_corporativo + curated_ga + curated_dynamic_yield); `op_digital_analytics.dts_retencao_saude_ga4`; tabelas de saúde (`vindi_charge`, `user_pet_cancel_request`, `clinic_rating_user`) do health-backoffice.

## 1. O que já existe e pode ser reaproveitado

| Item | Onde | Status verificado | Uso na frente 4 |
| --- | --- | --- | --- |
| Consultas `dy_results` / `dy_discovery` / `dy_daily` (v3 09/10, v4 13/10) | Roadmap do Digital; SQL e análise em dois artifacts citados em MS-5638 (não compartilhados com esta conta) | Confirmado pelo card Jira; 626 linhas e 52 campanhas validadas; custo ~30 GB/dia na v4 | Base dos modelos `exposures`, `metric_values`, `metric_results` e do método de `packages/stats`. Pedido de acesso em PEDIDOS |
| Dash Pelican `apps/shiny/teste-ab` (Hórus) | Repositório `pelican` (Streamlit/Shiny, Plataforma de Dados) | Documentado em Confluence (MS "Shiny - Teste A/B - Hórus"); sendo substituído | Referência de métricas de clube, saúde, margem e churn que só ele tinha; nomes das variantes/campanhas |
| `curated_dynamic_yield.daily_activity_stream` | BigQuery `petlove-dataeng-prod-01` (a confirmar) | Citado em MS-5639 como fonte mapeada; Kraken tem layout de path `dynamic-yield` | Fonte primária de `exposures` (impressões por campanha e variação) e das métricas de engajamento |
| `ssot_ga4.events`, `event_params`, `items`, `user_properties` | BigQuery `petlove-dataeng-prod-01.ssot_ga4`, ligadas por `join_key`, partição `refdate` | **Confirmado em dados de 13/10 (ver `FONTES.md`)**: impressão da DY em app (`DY_Variation_Impression`, ~716 mil/dia) e site (`DY Variation Impression`, ~340 mil/dia); `campaignName` + `variationName` em 100%; `experienceName` + IDs 100% no app e 45–60% no site; `dy_session_id` disponível | Fallback de exposição viável em site e app; rascunho em `data/models/exposures/ga4_variation_impression.sql` |
| Evento `DY Variation Impression` no dataLayer | `health-customers/src/utils/gtm.js:124-137` | Implementado para web de saúde; envia `campaignName`, `variationName` e `guid` | Confirma que o fallback GA4 traz nome de campanha e GUID para o site de saúde. Cobertura em app e e-commerce a confirmar |
| GUID do Chihuahua como CUID na DY e external_id na Braze | Confluence "Migração e Padronização do GUID em Braze e DY"; roadmap "Usuário Unificado 3Q25" marca "Braze e DY usando IDs únicos do CH (GUID)" como concluído | Documentado; taxa de casamento não medida | Chave de identidade entre DY, GA4 e banco; medir casamento na E3 |
| `op_mkt_cross.dts_churn_teste_ab` | BigQuery, partição `dt_churn` | Confirmado no catálogo (14/10): churn de Saúde e Clube por teste, regra "churn só após a data do teste" | Métricas churn do clube e churn de saúde |
| `dw_corporativo.ft_teste_ab` e `op_dashs_interativos.dts_teste_ab` | BigQuery, dono Marketing | Confirmado no catálogo (14/10): `ft_teste_ab` é a exposição por sessão GA4 (com test suite); `dts_teste_ab` agrega todas as métricas do Hórus por experiência × variante × plataforma × dia | Adaptador `dw_ft_teste_ab` (exposição de legados) e reconciliação de volumes |
| "Dataset \| Teste A/B" (`06_base_dy`, `07_faturamento_saude`, `08_custos_medicos_saude`, `09_base_pedidos`) | BigQuery, fontes `dw_corporativo`, `curated_ga`, `curated_dynamic_yield` | Documentado (MS); colunas `nm_experiencia`, `cod_variante`, `nm_variante`, `nm_campanha` | Receita faturada, margem 2, saúde (faturamento e custos médicos) |
| `op_digital_analytics.dts_retencao_saude_ga4` | BigQuery | Em produção; dados desde jun/2025; particionada por `data_processamento` | Funil de cancelamento/retenção de saúde (métrica secundária de Saúde) |
| Banco de Saúde (`curated_health.health_*` no BigQuery via Datastream; não existe dataset `health`) | `health_vindi_charge` (status, due_at, paid_at), `health_vindi_bill`, `health_vindi_subscription` (overdue_since), `health_user_pet` (dt_purchased, dt_canceled, cancel_type), `health_user_pet_cancel_request`, `health_clinic_rating_user` (average_rating); `user_pet_contract` não está no BigQuery | Código lido nesta sessão; projetos "DW Saúde KR4 2Q26" e "[Running][Saúde][Churn]" consolidando churn voluntário/involuntário | Conversão em saúde, vidas, receita e ticket de saúde, churn de saúde, inadimplência (parcela vencida) e CSAT de atendimento em clínica |
| CSAT de atendimento | DHUB "CSAT" (Zendesk por BU, supervisão e analista) e "Droz" (CSAT do bot) | Documentado como dashboard; tabela e dono a confirmar | Métrica "CSAT médio" e "chamados por usuário" |
| Protótipo do Faro | `https://claude.ai/artifact/FTFXpZhRkdf8HGjUXvLmg7` | Lido nesta sessão; valores do Nexus extraídos (apêndice A) | `fixtures/nexus.json`, layout da tela de resultados, regras de recomendação e síntese |

Clientes de DY existentes (`sheltie/clients/dynamic_yield.py`, `health-customers/src/services/dynamicYield`) usam apenas a API Choose/Event e não servem à leitura de resultados.

## 2. Decisões de arquitetura propostas

1. **Stack.** Contratos, motor estatístico, API e UI em TypeScript (conforme seção 6 do contexto). Modelos de dados em SQL BigQuery com parâmetros (`{{faro_id}}`, `{{refdate_start}}`, `{{refdate_end}}`), um arquivo por modelo, versionados em `data/models/`. Orquestração diária via DAG no Kraken (padrão da Plataforma de Dados), não em infraestrutura própria do Faro. `// DECISAO-PENDENTE:` se a Plataforma de Dados não absorver a DAG, fallback é um job agendado (Cloud Run) no `services/api`.
2. **Reaproveitar o método v4.** `packages/stats` implementa o que o contexto exige (z de duas proporções, delta method, `probBetter`, rótulos, SRM, MDE) e, atrás de flags por métrica, o que o roadmap já usa (CUPED 28 dias, Agresti-Caffo, Dunnett, Holm/BH, mínimo 30 eventos / 7 dias). A paridade com o Nexus (MET-17) só é atingível reproduzindo o mesmo método; o método vira documento em `docs/specs/frente-04/METODO.md`.
3. **Exposição com fonte plugável.** `exposures` é a união de adaptadores por fonte com o mesmo esquema: `dy_activity_stream` (padrão da spec; sem GUID, casa com GA4 pela sessão DY), `ga4_variation_impression` (GA4 bruto, com GUID de `user_properties`), `dw_ft_teste_ab` (fato governada de exposição por sessão, preferida para legados por custo e consistência com o Hórus), `ga4_experiment_exposure` (convenção da seção 7, quando existir) e `internal_engine` (motor interno do Nexus, placeholder). Rascunhos dos três primeiros em `data/models/exposures/`. O `Experiment` recebe `exposureSource` por plataforma; adicionar este campo é mudança de contrato (CHANGELOG).
4. **Identidade.** Chave primária `user_key` = GUID quando disponível; senão `dyid` (DY) ou `user_pseudo_id` (GA4) com `id_kind` marcado. Taxa de casamento por fonte e plataforma vira indicador em "Fonte dos dados" (MET-16).
5. **Custos de GA4.** Toda consulta a `ssot_ga4` recebe `refdate BETWEEN` fechado a partir da janela de leitura do experimento mais `maturationDays`. Nenhum modelo lê GA4 sem intervalo.
6. **Resultados materializados.** `metric_results` é a única tabela lida pela API; a UI nunca consulta BigQuery diretamente. Cada linha carrega `source_table`, `sql_ref` e `sql_version` para linhagem.

## 3. Etapas

Cada etapa termina com testes (unitários, de contrato e de qualidade de dados) e atualização de `STATUS.md`.

### E0 — Fase 0 (compartilhada, curta): contribuição da frente 4 em `packages/contracts`

- `packages/contracts/src/metrics.ts`: `MetricDefinition`, `MetricResult`, `SignificanceLabel` (já definidos no contexto) + tipos novos desta frente: `ExposureSource`, `Volumes`, `TestHealthPoint`, `SrmResult`, `MdeRow`, `Recommendation`, `Synthesis`, `ResultsResponse` (payload de MET-14).
- `packages/contracts/schemas/*.ts` (zod) para os tipos acima.
- `packages/contracts/fixtures/nexus.json`: valores do apêndice A, consolidado, Android e iOS, MDE, série diária, contaminação, split.
- `packages/contracts/fixtures/simulados/*.json`: cinco testes do protótipo (melhora confirmada com amostra incompleta, tendência sem significância, SRM, encerrado com vencedor, agendado sem dados) gerados pelo gerador seedado da E1.
- `packages/contracts/CHANGELOG.md`: registrar os tipos novos e o campo `Experiment.allocation.exposureSource?` e `Experiment.allocation.readWindow?` (janela de leitura; o Nexus lê de 31/08 a 12/10).

### E1 — `packages/stats` (biblioteca pura)

Arquivos: `src/proportions.ts`, `src/means.ts` (delta method para médias e razões), `src/probBetter.ts`, `src/labels.ts`, `src/srm.ts`, `src/mde.ts`, `src/sample.ts` (progresso e alerta de parada antecipada), `src/cuped.ts`, `src/corrections.ts` (Dunnett, Holm, BH), `src/recommend.ts` (MET-12), `src/synthesis.ts` (MET-13), `src/generator.ts` (dados sintéticos seedados), `src/index.ts`.

Testes: limites dos rótulos (79,9%, 80%, 95%, 5%, 20%); inversão para `lower_better`; SRM com casos conhecidos (split 2/98 do Nexus, 50/50, p < 0,001); contaminados excluídos; eventos antes da exposição não contam; paridade numérica com `fixtures/nexus.json` (tolerância 0,5% nos valores; deltas pelo método documentado). Meta: 100% dos ramos de rótulo e recomendação cobertos.

### E2 — Catálogo de métricas

- `data/models/metrics/catalog.json`: lista de `MetricDefinition` (id, nome, seção, kind, direction, unit, grains, definição, `sqlTemplateRef`, baseline, cv, owner, status, `maturationDays`).
- `data/models/metrics/<id>.sql`: um arquivo por métrica, produzindo `(user_key, faro_id, platform, grain, value)` a partir de `metric_events`.
- Dez métricas iniciais de eCom e Clube, com os ids do protótipo: `receita_por_usuario` (NORTE padrão), `conversao`, `transacoes_por_usuario`, `ticket_medio`, `receita_faturada_por_usuario`, `margem2_por_usuario`, `conversao_carrinho`, `conversao_repet_nova`, `conversao_clube`, `receita_clube_por_usuario`; mais `churn_clube` (via `dts_churn_teste_ab`).
- Fila de métricas `rascunho` (MET-02): endpoint `POST /metrics` grava `status: 'rascunho'`; publicação muda para `ativa` após revisão do dono. Registro no Catálogo de Dados (OpenMetadata) é pedido à Plataforma de Dados.

### E3 — Ingestão e modelo de exposição

- Verificar com a Plataforma de Dados: retenção e histórico de `curated_dynamic_yield.daily_activity_stream`, horário de chegada do arquivo, existência de alerta. Se a tabela já persiste histórico completo, MET-03 vira apenas monitoramento (alerta se o dia D-1 não chegou até 8h).
- `data/models/exposures/dy_activity_stream.sql`, `ga4_variation_impression.sql` (rascunho escrito a partir do levantamento de 14/10; colunas marcadas "A CONFIRMAR"), `exposures.sql` (rascunho escrito; união + regras): 1 linha por `user_key × faro_id`, `variant_key`, `first_exposure_at`, `platform`, `contaminated` (viu mais de uma variante), `id_kind`.
- Vínculo com o experimento: label `faro:FARO-AAAA-NNNN` da campanha; para legados, `DyLink.campaignName`. Controle identificado pelo `Design.variants[].isControl` ou, no legado, pelo nome ("home antiga").
- Testes de qualidade (MET-04): unicidade de `user_key × faro_id`, `contaminated` consistente, cobertura por plataforma, taxa de casamento GUID. Entregues como asserts SQL em `data/tests/` e registrados no Data Quality do Kraken.
- Correção já aprendida pelo roadmap: controle que volta depois do rollout não conta exposição após o fim da janela.

### E4 — `metric_events`, `metric_values`, `metric_results` para eCom e paridade com o Nexus

- `data/models/events/ecom_ga4.sql`, `ecom_banco.sql`, `clube.sql`: eventos de negócio por `user_key` e data.
- `data/models/metric_values.sql`: só eventos com `event_at >= first_exposure_at` dentro da janela de leitura; grão usuário e, quando a métrica suportar, sessão.
- `data/models/metric_results.sql` + job `services/api/results/jobs/compute.ts`: agrega por variante × plataforma × grão e chama `packages/stats`; grava `metric_results` com volumes (MET-07), SRM e dias de split instável (MET-08), MDE (MET-09), série diária (MET-11), linhagem (MET-16).
- Paridade MET-17: script `scripts/parity-nexus.ts` compara `metric_results` do Nexus com `fixtures/nexus.json` e falha acima de 0,5%. Pré-requisito: acesso ao SQL v4 e ao export de 13/10.

### E5 — API e UI de resultados

- `services/api/results/`: `GET /results/{faroId}?grain=user|session&platform=all|site|android|ios` retornando `ResultsResponse` (MET-14); `GET /metrics`, `POST /metrics` (E2); cache por `asOf`.
- `apps/web/features/resultados/`: implementa o template da frente 5 (MET-15) com as seções já validadas no protótipo: cabeçalho com tags, design no topo, variantes com split, síntese, "o que fazer", tabela por seção com NORTE/GUARDA/SECUNDÁRIA, alternância usuário/sessão e consolidado/plataforma, saúde do teste, detectabilidade, "como os números são calculados" e "fonte dos dados". Até o template da frente 5 chegar, usa um mock local `templates.mock.ts` com a estrutura do protótipo.

### E6 — Fontes de Saúde, Fintech, Retenção e CSAT (uma por vez, com dono)

| Fonte | Modelo | Tabelas candidatas | Dono a confirmar |
| --- | --- | --- | --- |
| Saúde | `events/saude.sql` | `health.user_pet`, `user_pet_contract`, `user_pet_plan`, `vindi_subscription`, `vindi_bill`; "Dataset \| Teste A/B" (`07_faturamento_saude`); churn via `user_pet_cancel_request` + `cancelment_reasons` e o dataset do projeto "[Running][Saúde][Churn]" | Dados Saúde (DHUB) |
| Fintech / inadimplência | `events/inadimplencia.sql` | `health.vindi_charge` (`status`, `due_at`) e `consolidation_bills`; definição proposta: % de usuários expostos com parcela vencida há mais de N dias (N = 30 como padrão conservador, `// DECISAO-PENDENTE:`); `maturationDays = N + ciclo de cobrança` | Fintech / Saúde Retenção (card SAURET-617 "Motor da Régua de Inadimplência") |
| Fintech / cashback | `events/cashback.sql` | Petcoins e saldo (`customer_balance`, `customer_balance_transactions`) | Fintech |
| Retenção | `events/retencao.sql` | `09_base_pedidos` (recompra em 30/60/90) e `dts_churn_teste_ab` | Marketing Data |
| Atendimento / CSAT | `events/csat.sql` | Zendesk (DHUB "CSAT"), Droz CSAT, `health.clinic_rating_user` (avaliação de atendimento em clínica) | Atendimento / DHUB |
| Operação | `events/operacao.sql` | GA4 (tempo de carregamento) e observabilidade | Plataforma |

### E7 — Recomendação, síntese e linhagem

- `recommend.ts` já nasce na E1 com as regras de MET-12 (SRM, guardrail piorado, implementar, manter, desligar variante, encerrar sem vencedor, desligar campanha com ~100% em uma variante).
- `synthesis.ts`: frase com a NORTE e até três métricas relevantes, no formato do protótipo.
- Linhagem: cada `MetricResult` carrega `lineage: { sourceTable, sqlRef, sqlVersion }`; a UI mostra em "Fonte dos dados".
- Alertas: dia D-1 ausente no Activity Stream; significância antes da amostra (MET-10); custo diário acima do orçamento (meta inicial: igual ou abaixo dos ~30 GB/dia do roadmap v4, com medição por experimento).

## 4. Contratos

**Consome:** `Experiment` (design, alocação, janela de leitura, `DyLink.labels`, `legacy`), templates de relatório e de métricas por tipo de teste (frente 5, mockados até existirem).

**Expõe:** `MetricDefinition`, `MetricResult`, `ResultsResponse`, tabela `exposures` (frente 3), indicadores de SRM, amostra e recomendação (frente 2).

**Mudanças de contrato a registrar no CHANGELOG:** `Experiment.allocation.exposureSource?`, `Experiment.allocation.readWindow?`, `MetricDefinition.maturationDays?`, tipos de resposta da API. Nenhuma é incompatível; não exige ADR. Se a troca de ferramenta de A/B exigir mudar `DyLink`, abrir ADR.

## 5. Mocks

- `fixtures/nexus.json` e `fixtures/simulados/*.json` (E0).
- `services/api/results/mocks/experiments.mock.ts`: `Experiment` do Nexus e dos cinco simulados (frente 1 ainda não existe).
- `apps/web/features/resultados/templates.mock.ts`: template de relatório (frente 5).
- `data/models/**/*.sql` executáveis contra tabelas sintéticas em `data/fixtures/` (BigQuery emulator ou DuckDB com dialeto compatível, a decidir na E3).

## 6. Riscos

| Risco | Impacto | Mitigação |
| --- | --- | --- |
| Saída da Dynamic Yield durante o projeto | A fonte primária de exposição desaparece | Fonte plugável (decisão 3); priorizar a convenção `experiment_exposure` no GA4 com Analytics; acompanhar o motor interno do Nexus |
| Sem acesso ao SQL v4 e ao export de 13/10 | Paridade MET-17 impossível de provar | Pedido imediato (PEDIDOS); enquanto isso, paridade contra `fixtures/nexus.json` extraído do protótipo |
| Histórico do Activity Stream pode ser só 30 dias | Testes longos sem leitura | Verificar na E3; se preciso, DAG de backfill no Kraken |
| Custo de GA4 | Consultas de TB | Intervalo fechado obrigatório, partições por `refdate`, materialização diária incremental |
| Casamento GUID baixo em app | Métricas de banco não ligam à exposição | Medir e publicar a taxa; `id_kind` por linha; `probBetter` só sobre usuários casados, com volume reportado |
| Dois métodos estatísticos convivendo (contexto × roadmap v4) | Rótulos diferentes para o mesmo teste | Um só método, documentado em `METODO.md`, com flags por métrica e testes de paridade |
| Donos de inadimplência, CSAT e churn de saúde indefinidos | Métricas sem definição aprovada | Uma fonte por vez (E6), com dono nomeado antes de publicar a métrica como `ativa` |

## 7. Perguntas em aberto (atualizam a seção 13 da spec)

1. O export de 13/10 do Nexus usado no protótipo veio da aba do roadmap (v3 em produção desde 12/10) ou do Hórus? Define qual método reproduzir para a paridade.
2. Confirmar com Felipe Bhering: CUPED 28 dias e a correção do controle pós-rollout explicam o delta de +108,1% em receita por usuário (R$ 21,83 → R$ 88,20)? **Evidência de 14/10:** as somas do Hórus na mesma janela dão o controle com 2,5× mais transações e 4× mais receita do que o visualizador, e receita por sessão −29% para a home nova (ver `FONTES.md`, "Reconciliação do Nexus"). O sentido do resultado depende do método; sem o SQL v4 a paridade não fecha.
3. `curated_dynamic_yield.daily_activity_stream`: projeto, retenção, horário de chegada e se há alerta.
4. O GUID já chega como CUID no Activity Stream para Android e iOS? E o parâmetro `guid` está nos eventos `DY_Variation_Impression` do app e do e-commerce (no site de saúde está)? Qual a taxa de casamento observada? `dy_session_id` (GA4) pode casar com a sessão do Activity Stream.
5. Inadimplência: N dias e se conta parcela de saúde apenas ou também de outras BUs. Dono: Fintech ou Saúde Retenção?
6. CSAT: qual tabela do Zendesk/Droz está no BigQuery e qual chave liga ao usuário?
7. Com a saída da DY, o motor interno do Nexus vai publicar exposições em que tabela ou evento? Pedir o contrato cedo.
8. Onde roda o job diário: Kraken (preferido) ou infraestrutura do Faro?
9. Nexus: em sessões, a participação do controle cai de 3,9% para 0,7% ao longo do teste (ver `FONTES.md`). Em usuários expostos isso se repete? Como o visualizador chegou a "6 dias de split instável" e quais foram os dias?
10. O que aconteceu com as exposições do app a partir de 08/10 (queda de 86% no iOS até 13/10, coincidindo com o colapso de "Formato Novo" do Teste Banner Home)? Release 7.10.0, tagueamento ou fim de campanha? Define se a janela de leitura do Nexus deve terminar antes de 08/10.

## 8. Pedidos a registrar em `docs/specs/PEDIDOS.md`

- Marketing Data (Felipe Bhering): compartilhar os artifacts do MS-5638 (análise + SQL v4 e prévia das abas) e o export de 13/10 do Nexus.
- Digital (Virgilio): acesso ao repositório do roadmap (aba de testes) para extensão ou reuso.
- Plataforma de Dados: acesso aos repositórios `pelican`, `kraken` e `data-iac`; confirmar a tabela do Activity Stream; registrar `exposures` e `metric_values` no OpenMetadata; absorver a DAG diária.
- Analytics: validar a convenção `experiment_exposure` da seção 7 e a cobertura de `DY Variation Impression` em app e e-commerce.
- Frente 1: campos `exposureSource` e `readWindow` no cadastro.
- Frente 5: template de relatório e templates de métricas por tipo de teste.
- Nexus: contrato de exposição do motor interno de testes A/B.

## 9. Como validar (critérios de aceite desta frente)

- Testes automatizados da E1 verdes com 100% dos ramos de rótulo e recomendação.
- Paridade com o Nexus dentro de 0,5% nos valores por variante (consolidado, Android e iOS).
- Testes de qualidade de `exposures` e `metric_values` passando no Kraken.
- Resultados do D-1 disponíveis até 10h, com custo por experimento medido.
- Três analistas de BUs diferentes leem o relatório do Nexus e respondem "o que fazer" sem ajuda.

## Apêndice A — Valores do Nexus extraídos do protótipo (para `fixtures/nexus.json`)

Teste: Nexus | Nova Home do App. BU ecossistema, Android e iOS, split 2% × 98%, variantes `home antiga` (controle) × `home nova`. Campo desde 12/08 (63 dias); leitura de 31/08 a 12/10 (43 dias), grão usuário, export D-1 de 13/10 buscado em 14/10 09:40. 26.016 usuários viram 2 variantes (2,3%), excluídos. 6 dias de split instável em 90. NORTE: receita por usuário. GUARDA: conversão e margem 2. Secundárias: conversão para o carrinho, ticket médio, conversão em Repet nova. Recomendação: desligar a campanha no DY (uma variante com ~100% do tráfego).

Volumes (controle, variante, delta %):

| Grão | Usuários | Compradores | Transações | Receita (R$) |
| --- | --- | --- | --- | --- |
| Consolidado | 21.379 / 1.100.094 / +5.045,7 | 1.596 / 280.454 / +17.472,3 | 1.995 / 464.349 / +23.175,6 | 467.283 / 97.333.314 / +20.729,6 |
| Android | 8.415 / 592.676 / +6.943,1 | 399 / 140.372 / +35.081,0 | 501 / 232.990 / +46.405,0 | 111.736 / 47.714.272 / +42.602,7 |
| iOS | 12.964 / 507.418 / +3.814,1 | 1.197 / 140.082 / +11.602,8 | 1.494 / 231.359 / +15.385,9 | 355.547 / 49.619.042 / +13.855,7 |

Métricas (controle, variante, delta %, rótulo, probBetter %):

| Métrica | Consolidado | Android | iOS |
| --- | --- | --- | --- |
| Receita por usuário (R$) | 21,83 / 88,20 / +108,1 / melhora confirmada / 100 | 13,28 / 80,23 / +138,3 / up / 100 | 27,38 / 97,51 / +100,8 / up / 100 |
| Conversão | 7,46% / 25,49% / +241,3 / up / 100 | 4,74% / 23,68% / +398,4 / up / 100 | 9,23% / 27,61% / +198,8 / up / 100 |
| Transações por usuário | 0,0933 / 0,4221 / +110,5 / up / 100 | 0,0595 / 0,3931 / +136,2 / up / 100 | 0,1152 / 0,4560 / +103,0 / up / 100 |
| Ticket médio (R$) | 233,95 / 208,97 / −10,7 / queda confirmada / 0 | 223,03 / 204,10 / −8,5 / down / 2 | 237,62 / 213,87 / −10,0 / down / 0 |
| Receita faturada por usuário (R$) | 29,18 / 111,85 / +92,2 / up / 100 | 17,69 / 103,35 / +122,8 / up / 100 | 36,65 / 121,77 / +82,6 / up / 100 |
| Margem 2 por usuário (R$) | 3,99 / 13,08 / +76,7 / up / 100 | 2,29 / 11,67 / +106,3 / up / 100 | 5,09 / 14,72 / +70,5 / up / 100 |
| Conversão para o carrinho | 10,13% / 30,62% / +202,2 / up / 100 | 7,78% / 29,22% / +274,9 / up / 100 | 11,65% / 32,25% / +176,8 / up / 100 |
| Conversão em Repet nova | 0,02% / 0,22% / +681,6 / tendência de melhora / 100 | 0,01% / 0,21% / +779,1 / tup / 100 | 0,03% / 0,23% / +501,0 / tup / 100 |
| Conversão no clube | 0,30% / 1,12% / +267,3 / up / 100 | 0,12% / 1,08% / +727,7 / tup / 100 | 0,42% / 1,16% / +173,0 / up / 100 |
| Receita do clube por usuário (R$) | 0,66 / 2,57 / +288,6 / up / 100 | 0,22 / 2,42 / +1.009,9 / tup / 100 | 0,95 / 2,75 / +189,5 / up / 100 |
| Churn do clube | 0 / 3,63% / +139,8 / sem tendência / 19 | 0 / 3,95% / −52,4 / none / 78 | 0 / 3,27% / +84,1 / none / 27 |
| Conversão em saúde | 0 / 0 / −74,7 / tendência de queda / 9 | 0 / 0 / −98,6 / tdown / 0 | 0 / 0 / −66,8 / tdown / 14 |
| Vidas por usuário | — | — | — |
| Receita de saúde por usuário | — | — | — |
| Ticket de saúde (R$) | — / 158,59 | — | — / 158,59 |
| Churn de saúde | — / 0 | — | — / 0 |

Observação: o rótulo "tendência de melhora" com probBetter 100% em Repet nova e clube (Android) e "sem tendência" com +139,8% em churn do clube vêm do visualizador e não seguem a regra de rótulo do contexto. Isso reforça a pergunta 1 (método e correções aplicadas, provavelmente Holm/BH e mínimo de eventos). A paridade deve reproduzir o rótulo do visualizador apenas quando o método estiver documentado.

MDE atual por métrica (%): receita por usuário 4,5; conversão 6,8; transações por usuário 3,4; ticket médio 5,6; receita faturada 5,4; margem 2 6,8; carrinho 5,7; Repet nova 114,4; clube 34,8; receita do clube 42,0; churn do clube 278,2; conversão em saúde 290,6; demais sem cálculo.

Usuários expostos por dia (controle, variante), 30/09 a 13/10: 350/17.500, 330/16.500, 300/15.000, 285/14.200, 220/11.000, 270/13.500, 250/12.500, 240/12.000, 220/11.000, 210/10.500, 200/10.000, 190/9.500, 120/6.000, 80/4.000 (valores aproximados, lidos do gráfico).

## Apêndice B — Mapa de arquivos desta frente

```
packages/contracts/src/metrics.ts, schemas/metrics.ts, fixtures/nexus.json, fixtures/simulados/
packages/stats/src/{proportions,means,probBetter,labels,srm,mde,sample,cuped,corrections,recommend,synthesis,generator,index}.ts + tests/
data/models/metrics/catalog.json, data/models/metrics/*.sql
data/models/exposures/{dy_activity_stream,ga4_variation_impression,exposures}.sql
data/models/events/*.sql, data/models/metric_values.sql, data/models/metric_results.sql, data/tests/*.sql
services/api/results/{routes,jobs,mocks}/
apps/web/features/resultados/
docs/specs/frente-04/{PLAN,STATUS,METODO}.md
```
