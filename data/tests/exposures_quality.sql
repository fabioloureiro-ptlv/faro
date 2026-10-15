-- Testes de qualidade de exposures (MET-04). Cada consulta deve retornar 0 linhas.
-- Registrar no Data Quality do Kraken quando a DAG existir.

-- 1. Unicidade de user_key × faro_id
SELECT faro_id, user_key, COUNT(*) AS n
FROM `{{project}}.{{dataset}}.exposures`
WHERE faro_id = '{{faro_id}}'
GROUP BY faro_id, user_key
HAVING n > 1;

-- 2. Contaminação consistente com variant_keys_seen
SELECT faro_id, user_key
FROM `{{project}}.{{dataset}}.exposures`
WHERE faro_id = '{{faro_id}}'
  AND contaminated != (ARRAY_LENGTH(variant_keys_seen) > 1);

-- 3. Cobertura por plataforma: toda plataforma da alocação tem expostos no dia D-1
SELECT p AS platform_sem_expostos
FROM UNNEST([{{allocation_platforms}}]) AS p
LEFT JOIN (
  SELECT DISTINCT platform FROM `{{project}}.{{dataset}}.exposures` WHERE faro_id = '{{faro_id}}' AND DATE(first_exposure_at) = DATE('{{refdate_end}}')
) AS e ON e.platform = p
WHERE e.platform IS NULL;

-- 4. Taxa de casamento GUID (informativa; falha abaixo de {{min_guid_share}})
SELECT platform, SAFE_DIVIDE(COUNTIF(id_kind = 'guid'), COUNT(*)) AS guid_share
FROM `{{project}}.{{dataset}}.exposures`
WHERE faro_id = '{{faro_id}}'
GROUP BY platform
HAVING guid_share < {{min_guid_share}};
