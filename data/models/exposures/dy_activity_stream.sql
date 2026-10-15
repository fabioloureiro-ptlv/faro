-- Exposição a partir do Daily Activity Stream da DY (adaptador 'dy_activity_stream', fonte padrão da spec).
-- Tabela: petlove-dataeng-prod-01.curated_dynamic_yield.daily_activity_stream (partição refdate; colunas confirmadas no catálogo em 14/10/2026).
-- Identidade: a tabela NÃO traz GUID/CUID. Chave nativa é dyid (por dispositivo) e session_id (sessão DY).
--   O casamento com GUID é feito em exposures.sql via GA4 (param dy_session_id ↔ session_id).
-- Parâmetros: {{refdate_start}}, {{refdate_end}}, {{campaign_names}} (ou {{campaign_ids}}).

SELECT
  'dy_activity_stream'                                  AS exposure_source,
  CAST(s.dyid AS STRING)                                AS user_key,
  'dyid'                                                AS id_kind,
  CAST(s.dyid AS STRING)                                AS dyid,
  CAST(s.session_id AS STRING)                          AS dy_session_id,
  s.campaign_id                                         AS dy_campaign_id,
  s.campaign_name,
  s.experience_id                                       AS dy_experience_id,
  s.experience_name,
  s.experiment_id,
  s.version_id,                                         -- um A/B pode ter várias versões: a janela de leitura deve fixar a versão
  s.variation_ids                                       AS dy_variation_id,
  s.variation_names                                     AS variation_name,     -- lista separada por vírgula só em Dynamic Content; em A/B é um nome
  -- A CONFIRMAR: como distinguir app de site no stream. Hipótese: eventos de app chegam sem url (SDK) e com operating_system Android/iOS;
  -- web em celular também tem OS Android/iOS, por isso a url entra na regra.
  CASE
    WHEN (s.url IS NULL OR s.url = '') AND LOWER(s.operating_system) LIKE '%android%' THEN 'android'
    WHEN (s.url IS NULL OR s.url = '') AND LOWER(s.operating_system) LIKE '%ios%'     THEN 'ios'
    ELSE 'site'
  END                                                   AS platform,
  s.device,
  s.operating_system,
  s.timestamp                                           AS exposed_at,
  s.refdate
FROM `petlove-dataeng-prod-01.curated_dynamic_yield.daily_activity_stream` AS s
WHERE s.refdate BETWEEN '{{refdate_start}}' AND '{{refdate_end}}'
  AND s.event_type = 'VARIATION_ENGAGEMENT'
  AND s.engagement_type = 'IMPRESSION'
  AND s.campaign_name IN ({{campaign_names}})
  AND s.variation_names IS NOT NULL;
