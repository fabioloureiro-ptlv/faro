-- Exposição a partir das impressões da DY registradas no GA4 (adaptador 'ga4_variation_impression').
-- Colunas confirmadas no OpenMetadata em 14/10/2026 (docs/specs/frente-04/catalogo-openmetadata-2026-10-14.md):
--   ssot_ga4.events: todas STRING; platform ('WEB' | 'ANDROID' | 'IOS'), device_category, event_timestamp (micros), user_pseudo_id, ga_session_id.
--   ssot_ga4.event_params: key (cluster), string_value, int_value…  ssot_ga4.user_properties: key 'guid' → string_value.
-- Volumes de 13/10: app 'DY_Variation_Impression' ~716 mil/dia; site 'DY Variation Impression' ~340 mil/dia (FONTES.md).
-- Saída: uma linha por impressão normalizada; a agregação por usuário fica em exposures.sql.
-- Parâmetros: {{refdate_start}}, {{refdate_end}} (intervalo fechado, obrigatório), {{campaign_names}} (lista de strings).

WITH impressions AS (
  SELECT
    e.join_key,
    e.refdate,
    SAFE_CAST(e.event_timestamp AS INT64) AS event_timestamp_micros,
    e.user_pseudo_id,
    e.ga_session_id,
    e.platform,
    e.device_category
  FROM `petlove-dataeng-prod-01.ssot_ga4.events` AS e
  WHERE e.refdate BETWEEN '{{refdate_start}}' AND '{{refdate_end}}'
    AND e.event_name IN ('DY_Variation_Impression', 'DY Variation Impression')   -- app usa underscore, site usa espaço
),
params AS (
  SELECT
    p.join_key,
    p.refdate,
    MAX(IF(p.key = 'campaignName',   p.string_value, NULL)) AS campaign_name,
    MAX(IF(p.key = 'variationName',  p.string_value, NULL)) AS variation_name,
    MAX(IF(p.key = 'experienceName', p.string_value, NULL)) AS experience_name,   -- 100% app, ~45–60% site
    MAX(IF(p.key = 'campaignID',     COALESCE(p.string_value, p.int_value), NULL)) AS dy_campaign_id,
    MAX(IF(p.key = 'experienceID',   COALESCE(p.string_value, p.int_value), NULL)) AS dy_experience_id,
    MAX(IF(p.key = 'variationID',    COALESCE(p.string_value, p.int_value), NULL)) AS dy_variation_id,
    MAX(IF(p.key = 'dy_session_id',  COALESCE(p.string_value, p.int_value), NULL)) AS dy_session_id,
    MAX(IF(p.key = 'guid',           p.string_value, NULL)) AS guid_param            -- health-customers envia no dataLayer
  FROM `petlove-dataeng-prod-01.ssot_ga4.event_params` AS p
  WHERE p.refdate BETWEEN '{{refdate_start}}' AND '{{refdate_end}}'
    AND p.key IN ('campaignName', 'variationName', 'experienceName', 'campaignID', 'experienceID', 'variationID', 'dy_session_id', 'guid')
  GROUP BY p.join_key, p.refdate
),
user_props AS (
  SELECT
    u.join_key,
    u.refdate,
    MAX(IF(u.key = 'guid', u.string_value, NULL)) AS guid_property                   -- mesmo caminho de dts_retencao_saude_ga4.chv_guid
  FROM `petlove-dataeng-prod-01.ssot_ga4.user_properties` AS u
  WHERE u.refdate BETWEEN '{{refdate_start}}' AND '{{refdate_end}}'
    AND u.key = 'guid'
  GROUP BY u.join_key, u.refdate
)
SELECT
  'ga4_variation_impression'                                  AS exposure_source,
  COALESCE(up.guid_property, pr.guid_param, i.user_pseudo_id) AS user_key,
  CASE
    WHEN up.guid_property IS NOT NULL OR pr.guid_param IS NOT NULL THEN 'guid'
    ELSE 'user_pseudo_id'
  END                                                         AS id_kind,
  i.user_pseudo_id,
  COALESCE(up.guid_property, pr.guid_param)                   AS guid,
  i.ga_session_id,
  pr.dy_session_id,
  pr.campaign_name,
  pr.variation_name,
  pr.experience_name,
  pr.dy_campaign_id,
  pr.dy_experience_id,
  pr.dy_variation_id,
  CASE UPPER(i.platform)
    WHEN 'ANDROID' THEN 'android'
    WHEN 'IOS'     THEN 'ios'
    ELSE 'site'
  END                                                         AS platform,
  i.device_category,
  TIMESTAMP_MICROS(i.event_timestamp_micros)                  AS exposed_at,
  i.refdate
FROM impressions AS i
JOIN params AS pr
  ON pr.join_key = i.join_key AND pr.refdate = i.refdate
LEFT JOIN user_props AS up
  ON up.join_key = i.join_key AND up.refdate = i.refdate
WHERE pr.campaign_name IN ({{campaign_names}})
  AND pr.variation_name IS NOT NULL;
