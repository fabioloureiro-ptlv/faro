-- Levantamento complementar dos eventos da DY no GA4 (frente 4, E3).
-- Projeto petlove-dataeng-prod-01 · dataset ssot_ga4 · um dia de refdate para custo baixo.
-- Colunas confirmadas pelo catálogo (14/10): events.platform / device_category / event_timestamp (STRING),
-- event_params.key / string_value / int_value, user_properties.key / string_value. INFORMATION_SCHEMA não é necessário.

-- ============================================================
-- A. Valores de platform / device por nome de evento de impressão
-- ============================================================
SELECT
  e.event_name,
  e.platform,
  e.device_category,
  COUNT(*)                         AS eventos,
  COUNT(DISTINCT e.user_pseudo_id) AS usuarios
FROM `petlove-dataeng-prod-01.ssot_ga4.events` AS e
WHERE e.refdate BETWEEN '2026-10-13' AND '2026-10-13'
  AND e.event_name IN ('DY_Variation_Impression', 'DY Variation Impression')
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- ============================================================
-- B. Cobertura de identidade por evento e plataforma:
--    guid em user_properties, guid em event_params, dy_session_id, campanha+variação
-- ============================================================
WITH imp AS (
  SELECT join_key, refdate, event_name, platform
  FROM `petlove-dataeng-prod-01.ssot_ga4.events`
  WHERE refdate BETWEEN '2026-10-13' AND '2026-10-13'
    AND event_name IN ('DY_Variation_Impression', 'DY Variation Impression')
),
par AS (
  SELECT
    join_key, refdate,
    MAX(IF(key = 'guid',          string_value, NULL))                          AS guid_param,
    MAX(IF(key = 'campaignName',  string_value, NULL))                          AS campaign_name,
    MAX(IF(key = 'variationName', string_value, NULL))                          AS variation_name,
    MAX(IF(key = 'dy_session_id', COALESCE(string_value, int_value), NULL))     AS dy_session_id
  FROM `petlove-dataeng-prod-01.ssot_ga4.event_params`
  WHERE refdate BETWEEN '2026-10-13' AND '2026-10-13'
    AND key IN ('guid', 'campaignName', 'variationName', 'dy_session_id')
  GROUP BY join_key, refdate
),
upr AS (
  SELECT join_key, refdate, MAX(string_value) AS guid_property
  FROM `petlove-dataeng-prod-01.ssot_ga4.user_properties`
  WHERE refdate BETWEEN '2026-10-13' AND '2026-10-13'
    AND key = 'guid'
  GROUP BY join_key, refdate
)
SELECT
  i.event_name,
  i.platform,
  COUNT(*)                                                                                   AS impressoes,
  ROUND(SAFE_DIVIDE(COUNTIF(u.guid_property IS NOT NULL), COUNT(*)), 4)                      AS pct_guid_user_properties,
  ROUND(SAFE_DIVIDE(COUNTIF(p.guid_param IS NOT NULL), COUNT(*)), 4)                         AS pct_guid_event_params,
  ROUND(SAFE_DIVIDE(COUNTIF(COALESCE(u.guid_property, p.guid_param) IS NOT NULL), COUNT(*)), 4) AS pct_guid_qualquer,
  ROUND(SAFE_DIVIDE(COUNTIF(p.dy_session_id IS NOT NULL), COUNT(*)), 4)                      AS pct_dy_session_id,
  ROUND(SAFE_DIVIDE(COUNTIF(p.campaign_name IS NOT NULL AND p.variation_name IS NOT NULL), COUNT(*)), 4) AS pct_campanha_e_variacao,
  COUNT(DISTINCT COALESCE(u.guid_property, p.guid_param))                                    AS guids_distintos,
  COUNT(DISTINCT p.campaign_name)                                                            AS campanhas_distintas
FROM imp AS i
LEFT JOIN par AS p ON p.join_key = i.join_key AND p.refdate = i.refdate
LEFT JOIN upr AS u ON u.join_key = i.join_key AND u.refdate = i.refdate
GROUP BY 1, 2
ORDER BY 1, 2;

-- ============================================================
-- C. Campanhas ativas em 13/10 por volume (localizar o Nexus pelo nome)
-- ============================================================
SELECT
  p.string_value             AS campaign_name,
  e.platform,
  COUNT(DISTINCT p.join_key) AS impressoes
FROM `petlove-dataeng-prod-01.ssot_ga4.event_params` AS p
JOIN `petlove-dataeng-prod-01.ssot_ga4.events` AS e
  ON e.join_key = p.join_key AND e.refdate = p.refdate
WHERE p.refdate BETWEEN '2026-10-13' AND '2026-10-13'
  AND e.refdate BETWEEN '2026-10-13' AND '2026-10-13'
  AND p.key = 'campaignName'
  AND e.event_name IN ('DY_Variation_Impression', 'DY Variation Impression')
GROUP BY 1, 2
ORDER BY impressoes DESC
LIMIT 100;

-- ============================================================
-- D. (Se tiver acesso a dw_corporativo) Nexus em ft_teste_ab: campanhas e variantes dos últimos 7 dias
-- ============================================================
SELECT nm_campanha, nm_variante, cod_variante, COUNT(DISTINCT cod_usuario_ga) AS usuarios, COUNT(*) AS sessoes
FROM `petlove-dataeng-prod-01.dw_corporativo.ft_teste_ab`
WHERE data_processamento BETWEEN '2026-10-07' AND '2026-10-13'
  AND LOWER(nm_campanha) LIKE '%home%'
GROUP BY 1, 2, 3
ORDER BY usuarios DESC
LIMIT 50;
