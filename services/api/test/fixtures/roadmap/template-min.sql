-- template mínimo com os quatro marcadores (a forma real está em data/queries/roadmap/)
DECLARE campanha_alvo STRING DEFAULT NULL;
WITH overrides AS (
  SELECT * FROM UNNEST([
    -- {overrides}
  ])
), linked AS (
  SELECT * FROM UNNEST([
    -- {linked}
  ])
), split AS (
  SELECT * FROM UNNEST([
    -- {split}
  ])
), norte AS (
  SELECT * FROM UNNEST([
    -- {norte}
  ])
)
SELECT 1;
