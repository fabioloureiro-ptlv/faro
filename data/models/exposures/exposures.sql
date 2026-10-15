-- exposures: uma linha por usuário × experimento (MET-04).
-- Regras (espelham packages/stats/src/attribution.ts, oráculo dos testes):
--   * variante e plataforma da primeira exposição dentro da janela de leitura;
--   * contaminado = viu mais de uma variante na janela; excluído das métricas e contado no relatório;
--   * dias de split instável removidos antes da agregação;
--   * fonte plugável: Experiment.allocation.exposureSource escolhe o adaptador; os três produzem o mesmo esquema.
-- Identidade: user_key = GUID quando existir; senão a chave nativa da fonte (dyid, public_id, user_pseudo_id), com id_kind.
--   Para o Activity Stream (sem GUID), o GUID é buscado pelo par dy_session_id ↔ GA4 (CTE guid_by_dy_session).
-- Parâmetros: {{faro_id}}, {{refdate_start}}, {{refdate_end}}, {{excluded_days}}, {{campaign_names}},
--             {{variant_map}} (variation_name → variant_key), {{exposure_source}} ∈ dy_activity_stream | ga4_variation_impression | dw_ft_teste_ab.

WITH raw AS (
  SELECT exposure_source, user_key, id_kind, dy_session_id, campaign_name, variation_name, platform, exposed_at, refdate
  FROM ({{dy_activity_stream}})          WHERE '{{exposure_source}}' = 'dy_activity_stream'
  UNION ALL
  SELECT exposure_source, user_key, id_kind, dy_session_id, campaign_name, variation_name, platform, exposed_at, refdate
  FROM ({{ga4_variation_impression}})    WHERE '{{exposure_source}}' = 'ga4_variation_impression'
  UNION ALL
  SELECT exposure_source, user_key, id_kind, CAST(NULL AS STRING) AS dy_session_id, campaign_name, variation_name, platform, exposed_at, refdate
  FROM ({{dw_ft_teste_ab}})              WHERE '{{exposure_source}}' = 'dw_ft_teste_ab'
),
guid_by_dy_session AS (
  -- Casamento sessão DY → GUID a partir do GA4 (só é usado quando a fonte não traz GUID).
  SELECT dy_session_id, ANY_VALUE(guid) AS guid
  FROM ({{ga4_variation_impression}})
  WHERE dy_session_id IS NOT NULL AND guid IS NOT NULL
  GROUP BY dy_session_id
),
identified AS (
  SELECT
    r.* EXCEPT (user_key, id_kind),
    COALESCE(IF(r.id_kind = 'guid', r.user_key, NULL), g.guid, r.user_key) AS user_key,
    CASE WHEN r.id_kind = 'guid' OR g.guid IS NOT NULL THEN 'guid' ELSE r.id_kind END AS id_kind
  FROM raw AS r
  LEFT JOIN guid_by_dy_session AS g
    ON r.id_kind <> 'guid' AND g.dy_session_id = r.dy_session_id
),
in_window AS (
  SELECT *
  FROM identified
  WHERE refdate BETWEEN '{{refdate_start}}' AND '{{refdate_end}}'
    AND refdate NOT IN ({{excluded_days}})
),
mapped AS (
  SELECT r.*, m.variant_key
  FROM in_window AS r
  JOIN UNNEST([{{variant_map}}]) AS m          -- STRUCT<variation_name STRING, variant_key STRING>
    ON m.variation_name = r.variation_name
),
per_user AS (
  SELECT
    user_key,
    ANY_VALUE(id_kind)                                                                                   AS id_kind,
    ARRAY_AGG(STRUCT(variant_key, platform, exposed_at, exposure_source) ORDER BY exposed_at LIMIT 1)[OFFSET(0)] AS first_exposure,
    COUNT(DISTINCT variant_key)                                                                          AS variants_seen,
    ARRAY_AGG(DISTINCT variant_key)                                                                      AS variant_keys_seen
  FROM mapped
  GROUP BY user_key
)
SELECT
  '{{faro_id}}'                        AS faro_id,
  user_key,
  id_kind,
  first_exposure.variant_key           AS variant_key,
  first_exposure.platform              AS platform,
  first_exposure.exposed_at            AS first_exposure_at,
  first_exposure.exposure_source       AS exposure_source,
  variants_seen > 1                    AS contaminated,
  variant_keys_seen,
  DATE('{{refdate_end}}')              AS as_of
FROM per_user;
