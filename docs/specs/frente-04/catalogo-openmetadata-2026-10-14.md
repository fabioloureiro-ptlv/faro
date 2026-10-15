# Catálogo OpenMetadata — Teste A/B, GA4 e Saúde

Levantamento feito no OpenMetadata em 14/10/2026. Todas as tabelas BigQuery estão no serviço `bq_sa`, projeto **`petlove-dataeng-prod-01`**. Linhagem = vizinhos imediatos registrados no catálogo (1 salto); quando o catálogo indica que há mais níveis acima, isso está sinalizado.

## Resumo e ressalvas

| Pedido | Encontrado no catálogo | Observação |
|---|---|---|
| `curated_dynamic_yield.daily_activity_stream` | ✅ | Sem descrição e sem linhagem registrada |
| `op_mkt_cross.dts_churn_teste_ab` | ✅ | |
| "Dataset \| Teste A/B" | ✅ `dw_corporativo.ft_teste_ab` + `op_dashs_interativos.dts_teste_ab` | `base_dy`, `faturamento_saude`, `custos_medicos_saude`, `base_pedidos` **não existem como tabelas** no catálogo (provavelmente CTEs/etapas internas da query) |
| `ssot_ga4.*` (4 tabelas) | ✅ | |
| `op_digital_analytics.dts_retencao_saude_ga4` | ✅ | |
| `health.*` (7 tabelas) | ⚠️ | **Não existe dataset `health` no BigQuery.** Mapeei para `curated_health.health_<tabela>` (camada governada). `user_pet_contract` não existe em `curated_health`/`ssot_health` — só no MySQL Nofaro e num backup |
| `analytics_base.report_campaign` | ❌ | Nenhuma tabela/dataset `analytics_base` ou `report_campaign` no catálogo |

---

## 1. `petlove-dataeng-prod-01.curated_dynamic_yield.daily_activity_stream`

- **Descrição:** sem descrição na tabela. Dataset: "Camada com dados do sistema Dynamic Yield deduplicados e governados pelo time de engenharia de dados".
- **Tipo:** Partitioned
- **Partição:** `refdate` (DAY) · **Clusterização:** nenhuma registrada
- **Dono:** Plataforma (herdado do dataset) · Domínio: Plataforma de Dados
- **Linhagem:** nenhuma upstream ou downstream registrada. Existe também `ssot_dynamic_yield.daily_activity_stream` com o mesmo schema (provável origem, mas sem aresta no catálogo).

| Coluna | Tipo | Descrição |
|---|---|---|
| audiences | STRING | Lista de IDs de audiência do usuário no momento do evento |
| audiences_names | STRING | Lista de nomes de audiência do usuário no momento do evento |
| browser | STRING | Navegador de onde o evento foi disparado |
| campaign_id | INT | ID da campanha da variação (em Experience Email, ID do bloco) |
| campaign_name | STRING | Nome da campanha da variação (em Experience Email, nome do bloco) |
| context_data | STRING | Dado do tipo de página (SKU em PRODUCT, categoria em CATEGORY, SKUs em CART) |
| context_type | STRING | Tipo de página, conforme o page context |
| device | STRING | Tipo de dispositivo que disparou o evento |
| device_brand | STRING | — |
| dyid | INT (numeric) | ID interno do visitante na DY, único por dispositivo |
| engagement_type | STRING | Tipo de engajamento com a variação: IMPRESSION, CLICK |
| event_id | INT | ID único de cada evento disparado pelo site |
| event_name | STRING | Nome do evento conforme a event API |
| event_properties | STRING | Propriedades do evento (variam por eventType) |
| event_type | STRING | Tipo do evento: DPX, UIA (pageview), VARIATION_ENGAGEMENT, UNIT_IMPRESSION, UNIT_CLICK |
| event_value | INT | Valor total do carrinho, em centavos |
| experience_id | INT | ID da experiência da variação |
| experience_name | STRING | Nome da experiência da variação |
| experiment_id | INT | ID único do teste |
| is_goal_hit | BOOLEAN | — |
| landing_context | STRING | — |
| landing_page | STRING | — |
| operating_system | STRING | Sistema operacional do dispositivo |
| parent_campaign_id | INT | Em Email Experience, ID da campanha de e-mail pai |
| parent_campaign_name | STRING | Em Email Experience, nome da campanha de e-mail pai |
| parent_variation_id | INT | Em touchpoints, ID da variação que serve o touchpoint |
| parent_variation_name | STRING | Em touchpoints, nome da variação que serve o touchpoint |
| proc_timestamp | TIMESTAMP | Timestamp interno de processamento do pipeline de analytics |
| product_ids | STRING | Lista de IDs de produto sobre os quais houve ação |
| referring_domain | STRING | — |
| req_timestamp | TIMESTAMP | Timestamp interno da requisição ao pipeline de analytics |
| screen_resolution | STRING | Resolução de tela do dispositivo |
| session_id | INT | ID interno de sessão do visitante na DY |
| skus | STRING | SKUs recomendados (view) ou SKU clicado em widget de recomendação |
| strategy_id | INT | ID da estratégia de recomendação servida |
| strategy_name | STRING | Nome da estratégia de recomendação servida |
| timestamp | TIMESTAMP | Momento da atividade (ms desde epoch) |
| touchpoint_id | INT | Em touchpoints, ID do touchpoint |
| touchpoint_name | STRING | Em touchpoints, nome do touchpoint |
| traffic_source | STRING | — |
| unique_transaction_id | INT | ID da transação em eventos de compra |
| url | STRING | URL de onde o evento foi disparado |
| url_clean | STRING | URL sem parâmetros |
| user_agent | STRING | — |
| user_type | STRING | — |
| variation_ids | STRING | ID(s) da variação servida/clicada (lista separada por vírgula em Dynamic Content Item List) |
| variation_names | STRING | Nome(s) da variação servida/clicada |
| version_id | INT | ID da versão do teste (um A/B pode ter várias versões) |
| refdate | DATE | — (coluna de partição) |
| reftimestamp | TIMESTAMP | — |

---

## 2. `petlove-dataeng-prod-01.op_mkt_cross.dts_churn_teste_ab`

- **Descrição:** Consolida dados de churn de Saúde e Clube de Testes A/B. Doc Confluence: "Dataset | Churn Teste A/B" (espaço MS, página 2055831561).
- **Tipo:** Partitioned
- **Partição:** `dt_churn` (DAY) · **Clusterização:** `data_processamento`
- **Dono:** Marketing (herdado) · Domínio: Marketing
- **Pipeline:** `chameleon_jobs_lineage.op_mkt_cross_lineage_dts_churn_teste_ab`
- **Linhagem upstream (há mais níveis acima):** `dw_corporativo.ft_teste_ab`, `dw_corporativo.dim_plataforma_marketing`, `dw_corporativo.dim_cliente`, `dw_corporativo.ft_planos_por_membro`, `dw_corporativo.dim_plano_clube_descontos`, `dw_corporativo.ft_transacoes_marketing`, `dw_corporativo.dim_municipio`, `dw_corporativo.dim_perfil_clube_descontos`, `dw_corporativo.ft_cancelamentos_clube_descontos`, `op_clube_descontos.dts_classificacao_cliente_clube`, `op_clube_descontos.dim_perfil_clube_descontos`, `op_clube_descontos.dts_planos_por_membro`, `op_clube_descontos.dim_plano_clube_descontos`, `op_clube_descontos.ft_cancelamentos_clube_descontos`, `op_health.beneficiarios`, `curated_ga.itd_caminho_compra_ga4`
- **Downstream:** `op_dashs_interativos.dts_teste_ab`, `op_dashs_interativos.dts_teste_ab_spk` (deletada)

| Coluna | Tipo | Descrição |
|---|---|---|
| chv_sessao | STRING | Concatenação do número da sessão e user pseudo ID do GA4 |
| chv_canais_marketing | STRING | Chave canais marketing para join |
| chv_plataforma_marketing | STRING | Chave plataforma marketing para join |
| cod_experiencia | STRING | Código da experiência da Dynamic Yield |
| nm_experiencia | STRING | Nome da experiência da Dynamic Yield |
| cod_variante | STRING | Código da variante da Dynamic Yield |
| nm_variante | STRING | Nome da variante da Dynamic Yield |
| nm_campanha | STRING | Nome da campanha da Dynamic Yield |
| nm_host | STRING | Host — URL do site (e-comm, saúde, serviços) |
| nm_unidade_negocio | STRING | Nome da unidade de negócio |
| nm_plataforma | STRING | Nome da plataforma |
| nm_categoria_dispositivo | STRING | Categoria do dispositivo |
| dt_evento | DATE | event_date do GA |
| cod_transacao | STRING | Código da transação |
| dt_churn | DATE | Data de churn (partição) |
| data_processamento | DATE | Data de processamento para carga incremental (cluster) |
| chv_pet | INT | ID do pet em Saúde (id_pet da beneficiarios) |
| chv_tutor | INT | ID do tutor em Saúde |
| chv_membro | INT | ID do membro no Clube |
| chv_email | STRING | E-mail com hash |
| nm_tipo_cliente | STRING | Tipo de cliente do Clube |
| cod_transacao_saude | INT | ID da assinatura do pet na Vindi (não único por pet) |
| cod_primeira_transacao_saude | INT | ID da primeira assinatura do pet na Vindi |
| chv_plano | INT | ID do plano de Saúde ou do Clube |
| nm_regiao_teste_ab | STRING | Região da campanha segundo os dados do Teste A/B |
| ds_plano | STRING | Descrição do plano de Saúde ou do Clube |
| ds_tipo_venda | STRING | Tipo de venda em Saúde (B2B2C, B2B2E, B2C) |
| cod_public_id | STRING | Public ID do usuário |
| chv_pagamento | INT | ID do pagamento Clube |
| nm_tipo_produto | STRING (NOT NULL) | Tipo de produto do plano de Saúde ou Clube |
| vlr_plano | FLOAT | Valor do plano de Saúde (nominal) ou Clube |

---

## 3. "Dataset | Teste A/B"

As colunas `nm_experiencia`, `cod_variante`, `nm_variante` e `nm_campanha` aparecem, em tabelas ativas, apenas em: `dw_corporativo.ft_teste_ab`, `op_dashs_interativos.dts_teste_ab` e `op_mkt_cross.dts_churn_teste_ab` (+ seu `_bkp`).

**Sobre `base_dy`, `faturamento_saude`, `custos_medicos_saude`, `base_pedidos`:** nenhuma delas está catalogada como tabela. Pela linhagem de `op_dashs_interativos.dts_teste_ab`, a correspondência mais provável (inferência minha, não confirmada no catálogo) é:

| Etapa | Fonte provável na linhagem |
|---|---|
| base_dy | `dw_corporativo.ft_teste_ab` |
| faturamento_saude | `op_health.faturamento_pet_nofaro` (campo `valor_total_faturado`, citado na descrição de `vlr_total_faturado_saude`) |
| custos_medicos_saude | `op_health.custos_medicos` (campo `valor_origem`, citado na descrição de `vlr_total_custos_medicos_saude`) |
| base_pedidos | `dw_corporativo.ft_transacoes_marketing`, `op_digital_analytics.dts_transacoes_faturado`, `curated_ga.itd_transactions_ga4` |

Obs.: existe `op_revenue.dts_base_pedidos` (dono Ecom), mas é uma agregação mensal comercial sem relação com Teste A/B.

### 3a. `petlove-dataeng-prod-01.dw_corporativo.ft_teste_ab`

- **Descrição:** Tabela fato com informações referentes aos testes A/B realizados pelas BUs da companhia por meio da Dynamic Yield.
- **Partição:** `data_processamento` (DAY) · **Clusterização:** `data_processamento`
- **Dono:** Marketing (direto) · possui test suite de qualidade
- **Pipeline:** `chameleon_jobs_lineage.dw_corporativo_lineage_ft_teste_ab`
- **Linhagem upstream (há mais níveis):** `ssot_ga4.events`, `ssot_ga4.event_params`, `curated_ga.itd_transactions_ga4`, `curated_ga.itd_sessao_ga4`, `curated_ga.trafficsource_ga4`, `dw_corporativo.ft_pedido_faturado`, `dw_corporativo.dim_plataforma_marketing`, `dw_corporativo.dim_canais_marketing`. Note que **não** consome `curated_dynamic_yield.daily_activity_stream` — a exposição ao teste vem dos eventos do GA4.
- **Downstream:** `op_dashs_interativos.dts_teste_ab`, `op_mkt_cross.dts_churn_teste_ab`, `op_dashs_interativos.dts_teste_ab_spk` (deletada)

| Coluna | Tipo | Descrição |
|---|---|---|
| chv_sessao | STRING | Concat do número da sessão e user pseudo ID do GA4 |
| public_id | STRING | ID externo do cliente |
| chv_canais_marketing | STRING | Chave canais marketing |
| chv_plataforma_marketing | STRING (NOT NULL) | Chave plataforma marketing |
| cod_experiencia | STRING | Código da experiência da DY |
| nm_experiencia | STRING | Nome da experiência da DY |
| cod_variante | STRING | Código da variante da DY |
| nm_variante | STRING | Nome da variante da DY |
| nm_campanha | STRING | Nome da campanha da DY |
| nm_host | STRING | Host — URL do site (e-comm, saúde, serviços) |
| dt_timestamp_evento | TIMESTAMP | event_timestamp do GA |
| dt_evento | DATE | event_date do GA |
| data_processamento | DATE | event_date do GA (partição/cluster) |
| cod_sessao_ga | STRING | ga_session_id |
| cod_usuario_ga | STRING | user_pseudo_id |

### 3b. `petlove-dataeng-prod-01.op_dashs_interativos.dts_teste_ab`

- **Descrição:** Tabela de teste A/B do Dashboard Hórus.
- **Partição:** `data_processamento` (DAY) · **Clusterização:** nenhuma registrada
- **Dono:** Marketing
- **Pipeline:** `chameleon_jobs_lineage.op_dashs_interativos_lineage_dts_teste_ab`
- **Linhagem upstream (há mais níveis):** `dw_corporativo.ft_teste_ab`, `op_mkt_cross.dts_churn_teste_ab`, `dw_corporativo.ft_transacoes_marketing`, `dw_corporativo.dim_plataforma_marketing`, `dw_corporativo.dim_municipio`, `curated_ga.itd_transactions_ga4`, `curated_ga.itd_caminho_compra_ga4`, `op_digital_analytics.dts_transacoes_faturado`, `op_health.custos_medicos`, `op_health.faturamento_pet_nofaro`, `op_health.beneficiarios`, `op_clube_descontos.dim_perfil_clube_descontos`, `op_clube_descontos.ft_cancelamentos_clube_descontos`
- **Downstream:** dashboard `pelican-shiny.teste-ab` (Hórus · Teste A/B)

| Coluna | Tipo | Descrição |
|---|---|---|
| cod_experiencia | STRING | Código da experiência |
| nm_experiencia | STRING | Nome da experiência |
| cod_variante | STRING | Código da variante |
| nm_variante | STRING | Nome da variante |
| nm_campanha | STRING | Nome da campanha |
| nm_plataforma | STRING | Nome da plataforma |
| nm_categoria_dispositivo | STRING | Categoria do dispositivo |
| nm_unidade_negocio | STRING | Unidade de negócio |
| data_processamento | DATE | event_date do GA (partição) |
| num_sessoes | INT | Número de sessões |
| num_visualizacao_produto | INT | Visualizações de produto |
| num_carrinho | INT | Etapas de carrinho |
| num_adicao_produto_repet | INT | Adições de produto ao Repet |
| num_transacao_geral | INT | Transações (geral) |
| num_transacao_ecomm | INT | Transações e-comm |
| num_transacao_repet | INT | Transações Repet |
| num_transacao_novos_repet | INT | Transações de novos clientes Repet |
| num_transacao_clube | INT | Transações Clube |
| num_tipo_fluxo_carrinho | INT | Fluxo carrinho |
| num_tipo_fluxo_catalogo | INT | Fluxo catálogo |
| num_tipo_fluxo_checkout | INT | Fluxo checkout |
| num_tipo_fluxo_lp | INT | Fluxo LP |
| num_tipo_fluxo_pdp | INT | Fluxo PDP |
| vlr_receita_clube_captado | FLOAT | Receita captada Clube |
| vlr_receita_ecom_captado | FLOAT | Receita captada e-commerce |
| vlr_receita_bruta_repet | FLOAT | Receita bruta Repet |
| vlr_receita_bruta_ecom | FLOAT | Receita bruta e-commerce |
| vlr_margem2_ecom | FLOAT | Margem 2 |
| num_transacao_saude | INT | Transações Saúde |
| num_pets_saude | INT | Pets Saúde |
| num_pets_leve / ideal / tranquilo / essencial / completo | INT | Pets por plano de Saúde (Leve, Ideal, Tranquilo, Essencial, Completo) |
| num_churn_saude | INT | Churn de Saúde |
| num_pets_churn_saude | INT | Pets em churn de Saúde |
| num_churn_clube | INT | Clientes em churn do Clube |
| vlr_receita_saude_captado | FLOAT | Receita captada Saúde |
| vlr_total_faturado_saude | FLOAT | Faturamento acumulado de Saúde por id_pet, sem coparticipação (mensalidade + carência + marketplace + multa + donation + renegociação + troca de plano + consolidação). Origem: `op_health.faturamento_pet_nofaro.valor_total_faturado` |
| vlr_total_custos_medicos_saude | FLOAT | Custos médicos acumulados por id_pet. Nofaro: bruto sem coparticipação; MV: bruto × quantidade. Origem: `op_health.custos_medicos.valor_origem` |

---

## 4. `petlove-dataeng-prod-01.ssot_ga4.*`

Dataset: "Dados brutos de origem da API do GA4". Dono **Plataforma** (direto) · Domínio Plataforma de Dados. As quatro tabelas se ligam por `join_key`, **todas particionadas por `refdate` (DAY)**. Nenhuma tem upstream registrado (origem = export GA4). Colunas de valor estão tipadas como STRING no catálogo.

Colunas comuns às 4 tabelas:

| Coluna | Tipo | Descrição |
|---|---|---|
| join_key | STRING | MD5 de user_pseudo_id + event_timestamp + event_name + event_bundle_sequence_id + sequencial para desempate |
| refdate | DATE | event_date do GA (partição) |
| reftimestamp | TIMESTAMP | Data de gravação no BQ |
| data_source_type | STRING | Tipo de export GA4 de origem (daily_export ou fresh_daily_export) |

### 4a. `ssot_ga4.events`

- **Clusterização:** `event_name` · possui test suite
- **Downstream (≈43 diretos, amostra relevante):** `dw_corporativo.ft_teste_ab`, `op_marketing.dts_teste_ab`, `op_digital_analytics.dts_retencao_saude_ga4`, `curated_ga.itd_sessao_ga4_raw`, `curated_ga.itd_transactions_ga4`, `curated_ga.itd_caminho_compra_ga4`, `curated_ga.trafficsource_ga4`, `curated_ga.itd_user_stitch_raw`, `op_digital_analytics.dts_transacoes_faturado`, `op_mkt_performance.*`, `op_mkt_crm.*`

Demais colunas (99 no total) — todas **STRING** e **sem descrição** no catálogo:

| Grupo | Colunas |
|---|---|
| Evento | user_pseudo_id, event_timestamp, event_name, ga_session_id, event_previous_timestamp, event_value_in_usd, event_bundle_sequence_id, event_server_timestamp_offset, event_dimensions_hostname, stream_id, platform, is_active_user |
| Usuário / privacidade | user_id, user_first_touch_timestamp, user_ltv_revenue, user_ltv_currency, privacy_info_analytics_storage, privacy_info_ads_storage, privacy_info_uses_transient_token |
| Device | device_category, device_mobile_brand_name, device_mobile_model_name, device_mobile_marketing_name, device_mobile_os_hardware_model, device_operating_system, device_operating_system_version, device_vendor_id, device_advertising_id, device_language, device_is_limited_ad_tracking, device_time_zone_offset_seconds, device_browser, device_browser_version, device_web_info_browser, device_web_info_browser_version, device_web_info_hostname |
| Geo | geo_continent, geo_country, geo_region, geo_city, geo_sub_continent, geo_metro |
| App | app_info_id, app_info_version, app_info_install_store, app_info_firebase_app_id, app_info_install_source |
| Traffic source (usuário) | traffic_source_name, traffic_source_medium, traffic_source_source |
| Ecommerce | ecommerce_total_item_quantity, ecommerce_purchase_revenue_in_usd, ecommerce_purchase_revenue, ecommerce_refund_value_in_usd, ecommerce_refund_value, ecommerce_shipping_value_in_usd, ecommerce_shipping_value, ecommerce_tax_value_in_usd, ecommerce_tax_value, ecommerce_unique_items, ecommerce_transaction_id |
| Collected traffic source | collected_traffic_source_manual_campaign_id, _manual_campaign_name, _manual_source, _manual_medium, _manual_term, _manual_content, _gclid, _dclid, _srsltid |
| Batch | batch_event_index, batch_page_id, batch_ordering_id |
| Session last click — manual | session_traffic_source_last_click_manual_campaign_campaign_id, _campaign_name, _source, _medium, _term, _content, _source_platform, _creative_format, _marketing_tactic |
| Session last click — Google Ads | session_traffic_source_last_click_google_ads_campaign_customer_id, _account_name, _campaign_id, _campaign_name, _ad_group_id, _ad_group_name |
| Session last click — cross channel | session_traffic_source_last_click_cross_channel_campaign_campaign_id, _campaign_name, _source, _medium, _source_platform, _default_channel_group, _primary_channel_group |

### 4b. `ssot_ga4.event_params`

- **Clusterização:** `key` · possui test suite
- **Downstream (≈31 diretos):** inclui `dw_corporativo.ft_teste_ab`, `op_marketing.dts_teste_ab`, `op_digital_analytics.dts_retencao_saude_ga4`, `curated_ga.itd_sessao_ga4_raw`, `curated_ga.itd_transactions_ga4`, `curated_ga.itd_caminho_compra_ga4`

| Coluna | Tipo | Descrição |
|---|---|---|
| ga_session_id | STRING | — |
| key | STRING | — (cluster) |
| string_value | STRING | — |
| int_value | STRING | — |
| float_value | STRING | — |
| double_value | STRING | — |

### 4c. `ssot_ga4.items`

- **Clusterização:** `item_id`, `item_name`
- **Downstream (10+):** `curated_ga.itd_transactions_ga4`, `op_digital_analytics.dts_funil_produtos`, `dts_promocoes_*`, `op_mkt_performance.*`, `op_mkt_crm.dts_transactions_crm_saude`

Todas STRING, sem descrição: item_id, item_name, item_brand, item_variant, item_category, item_category2, item_category3, item_category4, item_category5, price_in_usd, price, quantity, item_revenue_in_usd, item_revenue, item_refund_in_usd, item_refund, coupon, affiliation, location_id, item_list_id, item_list_name, item_list_index, promotion_id, promotion_name, creative_name, creative_slot.

### 4d. `ssot_ga4.user_properties`

- **Clusterização:** `key`
- **Downstream:** `op_digital_analytics.dts_retencao_saude_ga4` (e há mais)

| Coluna | Tipo | Descrição |
|---|---|---|
| key | STRING | — (cluster) |
| string_value | STRING | — |
| int_value | STRING | — |
| float_value | STRING | — |
| double_value | STRING | — |
| set_timestamp_micros | STRING | — |

---

## 5. `petlove-dataeng-prod-01.op_digital_analytics.dts_retencao_saude_ga4`

- **Descrição:** Consolida o funil de retenção de Saúde a partir de eventos do GA4 para analisar o comportamento no fluxo de cancelamento: eventos de entrada (web e app) e do funil, classificação de etapas, motivo e submotivo de cancelamento e dados de sessão.
- **Partição:** `data_processamento` (DAY) · **Clusterização:** nenhuma registrada
- **Dono:** Marketing (herdado) · Domínio: Marketing
- **Linhagem upstream (há mais níveis):** `ssot_ga4.events`, `ssot_ga4.event_params`, `ssot_ga4.user_properties`, `curated_ga.itd_user_stitch`, `curated_ga.itd_sessao_ga4`, `dw_corporativo.dim_cliente`, `op_health.beneficiarios`
- **Downstream:** app `pelican-streamlit.save-flow-retencao-em-saude`

| Coluna | Tipo | Descrição |
|---|---|---|
| dt_evento | DATE | Data de referência do evento no GA4 (refdate) |
| chv_usuario | STRING | user_pseudo_id |
| chv_ga_sessao | STRING | ga_session_id |
| chv_sessao | STRING | Chave da sessão (ga_session_id + user_pseudo_id); nulo se ambos nulos |
| cod_user_id | STRING | user_id quando logado |
| chv_guid | STRING | GUID vindo de user_properties (key guid) |
| nm_plataforma | STRING | WEB, IOS, ANDROID etc. |
| nm_categoria_dispositivo | STRING | mobile, desktop, tablet |
| nm_cidade | STRING | Cidade por geolocalização |
| nm_estado | STRING | UF da sessão (sgl_uf_sessao) |
| nm_pais | STRING | País por geolocalização |
| nm_campanha | STRING | Campanha de aquisição da sessão |
| nm_origem | STRING | Source da sessão |
| nm_midia | STRING | Medium da sessão |
| nm_event_name | STRING | Nome do evento GA4 |
| nm_event_action | STRING | Parâmetro event_action |
| nm_event_label | STRING | Parâmetro event_label |
| nm_etapa | STRING | Etapa do funil de cancelamento/retenção |
| nm_motivo | STRING | Motivo de cancelamento |
| nm_submotivo | STRING | Submotivo de cancelamento |
| nm_retencao | STRING | Indicador de retenção no evento retencao_confirmada |
| data_processamento | DATE | Data da carga incremental (partição) |
| nm_origem_webview | STRING | webview_ios / webview_android quando a sessão veio da webview do app; nulo caso contrário |
| cod_tutor | INT | id_tutor (op_health.beneficiarios), via cod_pet ou via user_stitch → dim_cliente → e-mail |
| cod_pet | INT | ID do pet extraído da URL (/pet/{id}) |

---

## 6. `health.*` → `petlove-dataeng-prod-01.curated_health.health_*`

Padrão comum às tabelas `curated_health`:

- **Descrição do dataset:** "Camada com dados do sistema health deduplicados e governados pelo time de engenharia de dados". Glossário: Camadas de Dados – Curated.
- **Partição:** `refdate` (tipo de intervalo "OTHER" no catálogo) · **Clusterização:** nenhuma registrada
- **Dono:** Plataforma (direto) · Domínio: Plataforma de Dados
- **Origem:** replicação via **Datastream** do sistema Health/Nofaro (MySQL). Não há aresta upstream registrada no OpenMetadata. Equivalentes: `ssot_health.health_<tabela>` (+ `_hist`) e, no MySQL de staging, `mysql-health-shared-stag.default.nofaro.<tabela>`.

Colunas técnicas Datastream presentes em todas (não repetidas abaixo):

| Coluna | Tipo | Descrição |
|---|---|---|
| is_deleted | STRING | True se a linha foi deletada na origem |
| change_type | STRING | INSERT, UPDATE-INSERT, UPDATE-DELETE, DELETE |
| read_timestamp | TIMESTAMP | Quando o Datastream leu o registro (UTC) |
| source_timestamp | TIMESTAMP | Quando o registro mudou na origem (UTC) |
| sort_keys | STRING | Valores para ordenar eventos na ordem em que ocorreram |
| read_method | STRING | CDC, backfill histórico ou suplementação |
| log_file | STRING | Arquivo de log lido no CDC |
| log_position | INT | Posição no log (descrição no catálogo está copiada de change_type) |
| refdate | DATE | Data de referência da partição |
| reftimestamp | TIMESTAMP | Timestamp de referência/deduplicação |

### 6a. `curated_health.health_vindi_charge`

- **Descrição:** cobranças (charges) processadas na Vindi para o plano de saúde pet: status, tentativas, método de pagamento, vínculo com transações e clientes.
- **Downstream (há mais):** `op_health.faturamento_pet`, `op_health.faturamento_pet_nofaro`, `op_health.beneficiarios`, `op_health.historico_inadimplencia*`, `op_health.chargeback_motor_decisao`, `op_health.integracao_itau`, `dw_corporativo.ft_faturamento_plano_saude`, `dw_corporativo.ft_inadimplencia_*`, `dw_corporativo.ft_faturamento_assinatura_servicos`, `dw_corporativo.dts_detalhamento_saude_franquias`

| Coluna | Tipo | Descrição |
|---|---|---|
| id | INT | ID interno do registro |
| vindi_charge_id | INT | ID da cobrança na Vindi |
| amount | FLOAT | Valor da cobrança |
| status | STRING | Status atual |
| gateway_message | STRING | Mensagem do gateway |
| due_at | TIMESTAMP | Vencimento |
| paid_at | TIMESTAMP | Pagamento |
| installments | INT | Parcelas |
| attempt_count | INT | Tentativas realizadas |
| next_attempt | TIMESTAMP | Próxima tentativa |
| created_at | TIMESTAMP | Criação |
| updated_at | TIMESTAMP | Última atualização |
| vindi_bill_id | INT | Bill Vindi associada |
| vindi_customer_id | INT | Cliente Vindi |
| payment_method_code | STRING | Método de pagamento |
| vindi_transaction_id | INT | Transação Vindi |

### 6b. `curated_health.health_vindi_bill`

- **Descrição:** faturas (bills) geradas pela Vindi para os planos de saúde pet: valor, status, vencimento, pagamento e vínculo com assinaturas/clientes.
- **Downstream (≈36 diretos, há mais):** `op_health.faturamento_pet_nofaro`, `op_health.beneficiarios`, `op_health.receitas*`, `op_health.faturas_vindi`, `op_health.dts_inadimplencia`, `dw_corporativo.ft_faturamento_plano_saude`, `dw_corporativo.dts_sinistralidade_plano_saude`, `dw_corporativo.ft_cliente_faturado_saude`, `pelican-streamlit.app-extracao-saude`, entre outros

| Coluna | Tipo | Descrição |
|---|---|---|
| id | INT | ID interno |
| vindi_bill_id | INT | ID da bill na Vindi |
| vindi_subscription_id | INT | Assinatura Vindi |
| vindi_customer_id | INT | Cliente Vindi |
| vl_amount | FLOAT | Valor total |
| st_url | STRING | URL da cobrança na Vindi |
| st_status | STRING | Status na Vindi |
| due_at | TIMESTAMP | Vencimento |
| paid_at | TIMESTAMP | Pagamento |
| seen_at | TIMESTAMP | Visualização |
| billing_at | TIMESTAMP | Geração da cobrança |
| created_at | TIMESTAMP | Criação |
| updated_at | TIMESTAMP | Atualização |
| type | STRING | Tipo da cobrança |
| plan_store_order_id | STRING | Pedido na loja de planos |
| treatment_id | STRING | Tratamento associado |
| vindi_updated_at | TIMESTAMP | Última atualização na Vindi |
| consolidation_bill_id | INT | Sem descrição |

### 6c. `curated_health.health_vindi_subscription`

- **Descrição:** assinaturas Vindi do plano de saúde pet: status, ciclos, vigência, método de pagamento e plano.
- **Downstream (≈26 diretos, há mais):** `op_health.beneficiarios`, `op_health.faturamento_pet*`, `op_digital_analytics.dts_transacoes_faturado`, `dw_corporativo.ft_venda_plano_saude`, `dw_corporativo.ft_venda_plano_pet`, `dw_corporativo.dim_canal_venda_saude`, `pelican-streamlit.lifetime-value-saude`, entre outros

| Coluna | Tipo | Descrição |
|---|---|---|
| id | INT | ID interno |
| vindi_subscription_id | INT | ID na Vindi |
| status | STRING | active, canceled, suspended… |
| start_at | TIMESTAMP | Início |
| end_at | TIMESTAMP | Encerramento |
| next_billing_at | TIMESTAMP | Próxima cobrança |
| overdue_since | TIMESTAMP | Em atraso desde |
| code | STRING | Código na Vindi |
| cancel_at | TIMESTAMP | Cancelamento |
| interval | STRING | Intervalo (ex.: months) |
| interval_count | INT | Qtde de intervalos entre cobranças |
| billing_trigger_type | STRING | Tipo de gatilho de cobrança |
| billing_trigger_day | INT | Dia de disparo |
| billing_cycles | INT | Total de ciclos |
| installments | INT | Parcelas |
| vindi_created_at | TIMESTAMP | Criação na Vindi |
| vindi_updated_at | TIMESTAMP | Atualização na Vindi |
| customer_id | INT | Cliente Vindi |
| plan_id | INT | Plano Vindi |
| payment_method_id | INT | Método de pagamento |
| payment_method_public_name | STRING | Nome público do método |
| current_period_id | INT | Período atual |
| payment_profile_id | INT | Perfil de pagamento |
| invoice_split | INT | Fatura dividida |
| product_count | INT | Qtde de produtos |
| product_amount | FLOAT | Valor dos produtos |
| meliuz_xtra | STRING | Benefício Méliuz Xtra |
| created_at | TIMESTAMP | Criação |
| updated_at | TIMESTAMP | Atualização |
| last_billing_day_update | DATE | Última alteração do dia de cobrança |
| origin | STRING | Origem (canal/sistema) |

### 6d. `curated_health.health_user_pet`

- **Descrição:** pets cadastrados no sistema de saúde: planos, microchip, status, operadoras e histórico financeiro.
- **Downstream (≈53 diretos, há mais):** `op_health.beneficiarios`, `op_health.custos_medicos`, `op_health.faturamento_pet*`, `op_health.dts_desligamentos`, `dw_corporativo.dim_pets`, `dw_corporativo.dim_cliente`, `dw_corporativo.ft_venda_plano_saude`, `dw_corporativo.ft_desligamento_plano_saude`, `op_mkt_crm.dts_lembrete_saude_crm`, `pelican-streamlit.churn-analytics`, `pelican-streamlit.programas-saude`, entre outros

| Coluna | Tipo | Descrição |
|---|---|---|
| id | INT | ID do pet |
| user_id | INT | Tutor |
| contract_code | INT | Código do contrato |
| st_name | STRING | Nome do pet |
| dt_birthday | DATE | Nascimento |
| num_age | INT | Idade |
| species_id | INT | Espécie |
| race_id | INT | Raça |
| num_chip | STRING | Microchip |
| plan_id | INT | Plano contratado |
| in_plan_status | INT | Status do plano |
| dt_plan_init | TIMESTAMP | Início do plano |
| st_plan_moip_signing_code | STRING | Código de assinatura Moip |
| st_plan_obs | STRING | Observações do plano |
| dt_plan_validate | TIMESTAMP | Validade do plano |
| in_plan_mode | STRING | Modalidade (mensal, anual) |
| st_gender | STRING | Sexo |
| st_payment | STRING | Forma de pagamento |
| st_plan_recomendation_code | STRING | Código de recomendação |
| in_status | INT | Status do registro |
| dt_chip_implantation | TIMESTAMP | Implantação do chip |
| dt_next_renewal | TIMESTAMP | Próxima renovação |
| hash_confirmation | STRING | Hash de confirmação |
| is_confirmed | INT | Cadastro confirmado |
| dt_created_at | TIMESTAMP | Criação |
| in_deleted | INT | Exclusão lógica |
| plan_beauty_id | INT | Plano de beleza |
| sale_value | FLOAT | Valor de venda |
| vindi_subscription_id | INT | Assinatura Vindi |
| vindi_product_id | INT | Produto Vindi |
| is_simulation | INT | Simulação |
| is_without_validation | INT | Sem validação |
| validate_vaccine | INT | Vacina validada |
| digital_signature | STRING | Assinatura digital do contrato |
| dt_purchased | TIMESTAMP | Compra |
| dt_canceled | TIMESTAMP | Cancelamento |
| cancel_type | STRING | Tipo de cancelamento |
| coupon_used | INT | Uso de cupom |
| operator_id | INT | Operadora |
| avatar | STRING | Imagem do pet |
| chip_temporary | INT | Chip temporário |
| chip_temporary_expire_at | DATE | Expiração do chip temporário |
| should_count_as_active | INT | Conta como ativo |
| discount_percentage | FLOAT | % de desconto |
| discount_cycles | INT | Ciclos com desconto |
| external_chip | INT | Chip externo |
| chip_user_id | INT | Usuário do chip externo |
| sponsor_id | INT | Patrocinador/parceiro |
| total_saving | numeric(10,2) | Economia acumulada |
| financial_status | STRING | Status financeiro |
| send_transaction_notification | INT | Envia notificação de transação |
| discount_more_pets | INT | Desconto multi-pet |
| origin | STRING | Canal de contratação |
| contract_id | STRING | ID externo do contrato |
| external_id | STRING | ID em sistema externo |
| mv_registry_code | STRING | Registro no MV |
| order_id | INT | Pedido |
| ref_code | STRING | Código de referência |
| number_of_installments | INT | Parcelas gratuitas de campanha |
| sales_source_id | INT | Fonte de vendas |
| is_chronic | INT | Condição crônica |
| chronic_exit_reason | STRING | Motivo de saída de crônico |
| foca_migration_error | STRING | Erro na migração Foca |
| foca_uuid | STRING | UUID no legado Foca |

### 6e. `user_pet_contract` ⚠️ (não existe em `curated_health`)

Não há `health_user_pet_contract` em `curated_health` nem em `ssot_health`. Existem apenas:

**(i) `mysql-health-shared-stag.default.nofaro.user_pet_contract`** (MySQL, staging)
- **Descrição:** contratos dos planos dos pets, com conteúdo e caminho do documento gerado.
- **Partição:** n/a (MySQL) · Constraints: PK `id`; UNIQUE (`mass_update_request_id`, `user_pet_id`); FK `mass_update_request_id` → `nofaro.contract_mass_update_requests.id`
- **Dono:** sem dono · **Linhagem:** nenhuma

| Coluna | Tipo | Descrição |
|---|---|---|
| id | BIGINT (PK) | ID do contrato |
| user_pet_id | BIGINT (NOT NULL) | FK para user_pet |
| content | BLOB | Conteúdo binário do contrato |
| contract_path | VARCHAR(255) | Caminho/URL do arquivo |
| created_at | TIMESTAMP | Criação |
| updated_at | TIMESTAMP | Atualização |
| plan_name | VARCHAR(255) | Nome do plano |
| plan_private_name | VARCHAR(255) | Nome interno do plano |
| plan_id | VARCHAR(255) | ID do plano |
| confirmed_from | VARCHAR(10) | Origem da confirmação |
| mass_update_request_id | BIGINT | FK para atualização em massa |

**(ii) `petlove-dataeng-prod-01.ssot_health_bkp_20231019.health_user_pet_contract`** (backup de out/2023)
- Partição `refdate` (DAY) · Dono Plataforma (herdado) · sem linhagem · todas as colunas de negócio STRING "Sem descrição": id, user_pet_id, content, contract_path, created_at, updated_at, plan_name, plan_private_name, plan_id, confirmed_from + is_deleted, change_type, source_timestamp, refdate, reftimestamp.

### 6f. `curated_health.health_user_pet_cancel_request`

- **Descrição:** solicitações de cancelamento de planos por pet: motivo, status, contato do solicitante, operadora e operador responsável. Tag PII.Sensitive.
- **Downstream (há mais):** `op_health.beneficiarios`, `op_health.dts_desligamentos`, `op_health.dts_okr1q24_churn`, `dw_corporativo.ft_desligamento_plano_saude`, `pelican-streamlit.churn-analytics`

| Coluna | Tipo | Descrição |
|---|---|---|
| id | INT | ID da solicitação |
| pet_id | INT | Pet |
| reason | STRING | Motivo informado |
| status | STRING | Status (pendente, concluída…) |
| description | STRING | Descrição detalhada |
| telephone | STRING | Telefone (PII.Sensitive) |
| city | STRING | Cidade |
| state | STRING | UF |
| finished_on | TIMESTAMP | Finalização |
| operator_id | INT | Operador responsável |
| sponsor_id | INT | Patrocinador/parceiro |
| assigned_at | TIMESTAMP | Atribuição a operador |
| created_at | TIMESTAMP | Criação |
| updated_at | TIMESTAMP | Atualização |
| cancelment_reason_id | INT | Motivo padronizado |
| source | STRING | Sem descrição |
| origin | STRING | Sem descrição |

Obs.: a versão MySQL (`nofaro.user_pet_cancel_request`) tem também a coluna `email`, ausente no BigQuery.

### 6g. `curated_health.health_clinic_rating_user`

- **Descrição:** avaliações CSAT feitas por usuários após atendimento em clínica credenciada, com quatro notas por critério (veterinário, recepção, limpeza, estrutura), média e observação livre.
- **Downstream (há mais):** `op_health.csat_rede_credenciada`, `dw_corporativo.dts_csat_plano_laboratorial`, `pelican-streamlit.regioes-360-saude`

| Coluna | Tipo | Descrição |
|---|---|---|
| id | INT | ID da avaliação |
| rating_token | STRING | Token da solicitação de avaliação |
| user_id | INT | Usuário avaliador |
| clinic_id | INT | Clínica avaliada |
| observation | STRING | Observação textual |
| rating | INT | Nota (1–5) do **atendimento veterinário** — não é a nota geral |
| is_active | INT | Avaliação ativa |
| dt_created_at | TIMESTAMP | Criação |
| dt_updated_at | TIMESTAMP | Atualização |
| is_visible | INT | Visível publicamente |
| treatment_id | INT | Tratamento relacionado |
| reception_service_rating | INT | Nota recepção (1–5, opcional) |
| cleanliness_rating | INT | Nota limpeza (1–5, opcional) |
| clinic_structure_rating | INT | Nota estrutura (1–5, opcional) |
| average_rating | FLOAT | Média das quatro notas |
| show_rating_request | INT | Exibir solicitação de avaliação |

Obs.: a versão MySQL tem ainda `reply` e `is_visible_reply`, ausentes no BigQuery.

---

## 7. `analytics_base.report_campaign`

**Não encontrada.** Não há dataset `analytics_base` nem tabela com `report_campaign` no nome em nenhum serviço catalogado.

---

## 8. Busca por "teste_ab", "dy_results", "dy_daily", "dy_discovery"

**`dy_results`, `dy_daily`, `dy_discovery`: nenhum ativo encontrado** (tabelas, dashboards, pipelines ou data models).

### Tabelas com "teste_ab"

| Ativo | Status | Dono | Nota |
|---|---|---|---|
| `dw_corporativo.ft_teste_ab` | Ativa | Marketing | Fato base (seção 3a) |
| `op_dashs_interativos.dts_teste_ab` | Ativa | Marketing | Base do Hórus (seção 3b) |
| `op_mkt_cross.dts_churn_teste_ab` | Ativa | Marketing | Seção 2 |
| `op_mkt_cross.dts_churn_teste_ab_bkp` | Ativa | Marketing | Backup/snapshot da anterior |
| `op_marketing.dts_teste_ab` | Ativa (Regular, sem partição) | Marketing | Versão antiga por sessão/usuário com colunas em inglês (experienceid, variationname, campaignname…) |
| `op_dashs_interativos.dts_teste_ab_spk` | Deletada | — | |
| `op_dashs_interativos.dts_teste_ab_bkp` | Deletada | — | |
| `op_dashs_interativos.dts_teste_ab_bkp_2025-09-19` | Deletada | Marketing | Tinha motivo/submotivo de cancelamento e nm_regiao |
| `op_digital_analytics.dts_teste_ab` | Deletada | Marketing | Tinha nm_id_versao, dt_inicio/final_versao |
| `marketing.dts_mkt_teste_ab` | Deletada | Marketing | |

### Dashboards

| Ativo | Status | Dono | Nota |
|---|---|---|---|
| `pelican-shiny.teste-ab` — "Teste Ab" (Hórus · Teste A/B) | Ativo | Marketing | Shiny de análise bayesiana de experimentos (E-commerce e Saúde); abas "Teste A/B" e "Resultados Salvos"; consome `op_dashs_interativos.dts_teste_ab` |
| Power BI — "Dash Monitoramento Teste AB - Frete" (+ data model) | Deletado | Shared Services | Teste A/B de frete (combinações de CD, prazo, custo) |

### Pipelines (serviço `chameleon_jobs_lineage`, Spark)

- `dw_corporativo_lineage_ft_teste_ab`
- `op_mkt_cross_lineage_dts_churn_teste_ab`
- `op_dashs_interativos_lineage_dts_teste_ab`
- `op_dashs_interativos_lineage_dts_teste_ab_spk`
- `op_marketing_lineage_dts_teste_ab`
