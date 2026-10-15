# Frente 4 — Fontes de dados (levantamentos confirmados)

Registro do que foi verificado em dados reais. Cada item traz data, origem e o que ainda falta.

## GA4 planificado (`ssot_ga4`)

**Levantado em 14/10/2026 via BigQuery, dados de 13/10 (compartilhado por Fabio).**

- Projeto `petlove-dataeng-prod-01`, dataset `ssot_ga4`, tabelas `events`, `event_params`, `items`, `user_properties`, ligadas por `join_key`, particionadas por `refdate`. Toda consulta usa intervalo fechado de `refdate`.
- Evento de impressão da DY existe em site e app, com nomes diferentes:

| Plataforma | `event_name` | Volume/dia | `campaignName` | `experienceName` + IDs |
| --- | --- | --- | --- | --- |
| App | `DY_Variation_Impression` | ~716 mil | 100% | 100% (`campaignID`, `experienceID`, `variationID`) |
| Site | `DY Variation Impression` | ~340 mil | 100% | ~45–60% conforme device |

- `variationName` e `campaignName` chegam sempre em par (1.092.186 ocorrências de cada, site e app). Análise por campanha + variação está coberta em tudo; por experiência, só o app é confiável hoje.
- Toda consulta precisa tratar os dois nomes: `event_name IN ('DY_Variation_Impression', 'DY Variation Impression')`.
- No site, `variationName`/`campaignName` vazam para `session_start` e `first_visit` (~30 mil/dia). Filtrar pelos eventos de impressão.
- Parâmetro `dy_session_id` (~2,4 mi/dia) liga a sessão GA4 à sessão DY sem depender do Identify.

**Consequências para o modelo de exposição**
- O fallback GA4 (`ga4_variation_impression`) é viável em site e app, com vínculo por `campaignName` + `variationName`. Com o `faroId` no nome da campanha (convenção da seção 7 do contexto) o vínculo fica direto; para legados, pelo nome da campanha cadastrado em `DyLink.campaignName`.
- `dy_session_id` permite casar a exposição do GA4 com o Activity Stream da DY (sessão DY) e medir a taxa de casamento entre as duas fontes.
- Falta confirmar: presença e cobertura do parâmetro `guid` nos eventos de impressão (o health-customers envia; app e e-commerce a verificar); nomes exatos das colunas de `event_params` (`key`, `string_value`…); `platform`/`device_category` em `events`.

## Dynamic Yield — Daily Activity Stream

- `curated_dynamic_yield.daily_activity_stream` (projeto a confirmar), citado em MS-5639 como fonte mapeada de campanha × experiência × estratégia. Retenção, horário de chegada e alerta a confirmar com a Plataforma de Dados.

## Demais fontes

Ver seção 1 do `PLAN.md`. Mover para cá à medida que forem verificadas em dados reais.

## Catálogo de Dados (OpenMetadata) — levantamento de 14/10/2026

Arquivo completo: `catalogo-openmetadata-2026-10-14.md`. Tudo em `petlove-dataeng-prod-01`. Pontos que mudam o desenho:

### Exposição
- **`dw_corporativo.ft_teste_ab`** (Marketing, com test suite): exposição por sessão GA4 já governada, com `nm_campanha`, `nm_variante`, `cod_variante`, `public_id`, `cod_usuario_ga`, `dt_timestamp_evento`. Vem de `ssot_ga4` e **não** do Activity Stream. É a base do Hórus (`op_dashs_interativos.dts_teste_ab`). Vira o adaptador `dw_ft_teste_ab`, preferido para legados por custo e consistência.
- **`curated_dynamic_yield.daily_activity_stream`**: partição `refdate`, sem descrição e sem linhagem; `ssot_dynamic_yield.daily_activity_stream` tem o mesmo schema (origem provável). Colunas úteis: `campaign_id/name`, `experience_id/name`, `experiment_id`, `version_id`, `variation_ids/names`, `event_type` (`VARIATION_ENGAGEMENT`), `engagement_type` (`IMPRESSION`/`CLICK`), `dyid`, `session_id`, `device`, `operating_system`, `url`, `timestamp`. **Não tem GUID/CUID.** Retenção/histórico ainda a confirmar.
- **GA4**: `events.platform` é `WEB`/`ANDROID`/`IOS`; `event_timestamp` é STRING em micros; `event_params.string_value`; **o GUID fica em `user_properties` (`key = 'guid'`)**, mesmo caminho usado por `dts_retencao_saude_ga4.chv_guid`.
- **Identidade**: Activity Stream ↔ GA4 pela sessão DY (`session_id` ↔ param `dy_session_id`, ~2,4 mi/dia). GA4 ↔ cliente por `user_properties.guid` ou por `curated_ga.itd_user_stitch` → `dw_corporativo.dim_cliente` → `op_health.beneficiarios` (caminho do funil de retenção).
- `analytics_base.report_campaign` não existe; removido do plano. `dy_results`/`dy_daily`/`dy_discovery` não estão catalogados (são consultas da app do roadmap, não tabelas).

### Métricas → tabelas (para o SQL de cada métrica)

| Métrica | Fonte principal | Observação |
| --- | --- | --- |
| Receita por usuário, conversão, transações por usuário, ticket médio, conversão para o carrinho | `curated_ga.itd_transactions_ga4`, `curated_ga.itd_caminho_compra_ga4` (GA4) | Mesmas fontes de `ft_teste_ab`/`dts_teste_ab` |
| Receita faturada por usuário, margem 2 | `dw_corporativo.ft_pedido_faturado`, `op_digital_analytics.dts_transacoes_faturado`, `dw_corporativo.ft_transacoes_marketing` | `dts_teste_ab.vlr_margem2_ecom` mostra que a margem já é calculada nessa cadeia |
| Conversão em Repet nova | `dts_teste_ab.num_transacao_novos_repet` → origem em `ft_transacoes_marketing` | Regra de "novo" a extrair do pipeline `op_dashs_interativos_lineage_dts_teste_ab` |
| Conversão no clube, receita do clube | `op_clube_descontos.dts_planos_por_membro`, `dim_perfil_clube_descontos`, `dw_corporativo.ft_planos_por_membro` | |
| Churn do clube | `op_mkt_cross.dts_churn_teste_ab` (`num_churn_clube`), `op_clube_descontos.ft_cancelamentos_clube_descontos` | Regra "churn só após a data do teste" já implementada lá |
| Conversão em saúde, vidas, receita de saúde, ticket de saúde | `op_health.beneficiarios`, `op_health.faturamento_pet_nofaro` (`valor_total_faturado`), `curated_health.health_user_pet` (`dt_purchased`, `plan_id`, `vindi_subscription_id`) | |
| Churn de saúde | `op_mkt_cross.dts_churn_teste_ab` (`num_churn_saude`), `curated_health.health_user_pet` (`dt_canceled`, `cancel_type`), `health_user_pet_cancel_request`, `dw_corporativo.ft_desligamento_plano_saude` | Projeto "[Running][Saúde][Churn]" consolida voluntário/involuntário |
| Inadimplência | `curated_health.health_vindi_charge` (`status`, `due_at`, `paid_at`), `health_vindi_subscription.overdue_since`, `dw_corporativo.ft_inadimplencia_*`, `op_health.historico_inadimplencia*` | Definição de N dias segue pendente (DECISAO-PENDENTE) |
| CSAT (rede credenciada) | `curated_health.health_clinic_rating_user` (`average_rating`, `rating` = atendimento veterinário), `op_health.csat_rede_credenciada` | CSAT de atendimento (Zendesk/Droz) ainda sem tabela confirmada |
| Retenção em 30 dias / recompra | `curated_ga.itd_transactions_ga4`, `dw_corporativo.ft_transacoes_marketing` | |
| Custos médicos (candidata a guardrail de saúde) | `op_health.custos_medicos` (`valor_origem`) | Já existe em `dts_teste_ab.vlr_total_custos_medicos_saude` |

### Correções ao plano
- Não existe dataset `health` no BigQuery: as tabelas de saúde estão em `curated_health.health_<tabela>` (replicação Datastream; usar `is_deleted`/`change_type` na deduplicação). `user_pet_contract` não está no BigQuery; usar `health_user_pet` (`contract_code`, `plan_id`, `dt_purchased`, `dt_canceled`).
- `op_dashs_interativos.dts_teste_ab` já agrega por experiência × variante × plataforma × dia todas as métricas do visualizador (eCom, Repet, Clube, Saúde, churn, faturamento e custos médicos). Serve para **reconciliar volumes** com o Hórus, mas não para o motor: é agregado por sessão/dia, sem valor por usuário, logo sem variância.

## Reconciliação do Nexus com o Hórus (`op_dashs_interativos.dts_teste_ab`) — 14/10/2026

Somas na janela de leitura (31/08 a 12/10, 43 dias), grão sessão, sem exclusões (`data/fixtures/dts_teste_ab_nexus_2026-08-31_2026-10-12.json`), lado a lado com o protótipo (grão usuário, export do visualizador):

| | Hórus controle | Protótipo controle | Hórus variante | Protótipo variante |
| --- | --- | --- | --- | --- |
| Unidades | 55.654 sessões | 21.379 usuários | 5.904.691 sessões | 1.100.094 usuários |
| Transações | 5.086 | 1.995 | 490.309 | 464.349 |
| Receita (R$) | 1.880.323 (bruta eCom) | 467.283 | 141.057.862 (bruta eCom) | 97.333.314 |
| Receita por unidade (R$) | 33,8 por sessão | 21,83 por usuário | 23,9 por sessão | 88,20 por usuário |
| Delta de receita por unidade | | | **−29% por sessão** | **+108% por usuário** |

Conclusões:
1. **O export do protótipo não é a soma do Hórus.** A variante fica próxima (transações −5%, compatível com excluir 2,3% de contaminados e 6 dias de split instável), mas o controle do Hórus tem 2,5× mais transações e 4× mais receita do que o do visualizador. Isso bate com o achado da v3 do roadmap: o controle que volta depois do rollout (2% residual) estava sendo contado e inflava o braço de controle. A paridade MET-17 só é possível reproduzindo essas exclusões, o que reforça o pedido do SQL v4.
2. **O sentido do resultado depende do método.** Por sessão e sem exclusões, a home nova perde para a home antiga em receita; por usuário, com as exclusões do visualizador, ganha +108%. Enquanto o método não estiver documentado, o Faro deve mostrar o Nexus com um aviso explícito, não como "melhora confirmada".
3. **Receita do protótipo = receita por usuário × usuários** (88,20 × 1.100.094 ≈ 97,0 milhões), ou seja, receita de compra do GA4 por usuário, não a receita bruta do eCom do Hórus (141 milhões). As duas definições precisam coexistir no catálogo com nomes distintos.
4. Para app, `num_carrinho` vem vazio no Hórus: a conversão para o carrinho do protótipo (10% → 31%) veio de outra fonte ou de outra definição.

### Série diária do Nexus (sessões, `dts_teste_ab`, 12/08 a 13/10) — 14/10/2026

Arquivos: `data/fixtures/dts_teste_ab_nexus_diario_2026-08-12_2026-10-13.tsv` (dados) e `dts_teste_ab_nexus_diario_srm.json` (participação do controle e SRM por dia, calculados com `packages/stats`).

| Data | Participação do controle (sessões) |
| --- | --- |
| 12/08 (início) | 3,9% |
| 31/08 (início da janela) | 1,6% |
| 30/09 | 0,66% |
| 12/10 (fim da janela) | 0,70% |

1. **Em sessões, o split não é estável em dia nenhum.** Contra o planejado 2% × 98%, os 43 dias da janela disparam o alerta de SRM (p < 0,001) e só 2 dias ficam entre 1,5% e 2,5%. A participação do controle cai de forma contínua, de 3,9% para 0,7%: o braço de controle não está sendo reabastecido na mesma proporção (usuários alocados no início, sem novos entrantes, ou migração para a home nova). Isso é diferente de "6 dias de split instável" do protótipo, que foi medido em usuários. A regra do Faro deve calcular o SRM em usuários expostos (não em sessões) e, além do teste pontual, acompanhar a tendência da participação do controle ao longo do tempo.
2. **Queda abrupta das sessões a partir de 08/10, mais forte no iOS.** `home nova` iOS: 62 mil em 08/10 → 27,8 mil em 11/10 → 8,8 mil em 13/10; Android cai de 82,8 mil para 26,9 mil no mesmo período. No mesmo intervalo, "Teste Banner Home · Formato Novo" cai de 22 mil para 1,4 mil e "Formato Antigo" sobe, o que sugere mudança de versão do app ou de tagueamento (release Android/iOS 7.10.0 na página do Nexus) e não comportamento de usuário. A janela de leitura termina em 12/10 e inclui esses dias; o Faro precisa de um alerta de "queda de volume de exposição" (ex.: dia abaixo de 50% da mediana dos 14 dias anteriores) que marque o dia como suspeito antes de rotular.
3. O dia 13/10 provavelmente está parcial no momento da consulta (export D-1 em andamento). O job diário do Faro deve só ler D-1 após o horário de chegada confirmado da fonte.
