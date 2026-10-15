-- Exposição a partir da fato governada dw_corporativo.ft_teste_ab (adaptador 'dw_ft_teste_ab').
-- É a tabela que o Hórus usa: exposição por sessão GA4, com testes de qualidade e dono Marketing.
-- Vantagem: não re-varre ssot_ga4 (barato, consistente com os números históricos). Limites: sem GUID (só public_id e user_pseudo_id),
-- sem IDs da DY e grão sessão. Serve como fonte principal de legados enquanto o GA4 bruto não traz o faroId.
-- Parâmetros: {{refdate_start}}, {{refdate_end}} (sobre data_processamento = event_date), {{campaign_names}}.

SELECT
  'dw_ft_teste_ab'                                      AS exposure_source,
  COALESCE(f.public_id, f.cod_usuario_ga)               AS user_key,
  IF(f.public_id IS NULL, 'user_pseudo_id', 'public_id') AS id_kind,
  f.cod_usuario_ga                                      AS user_pseudo_id,
  f.public_id,
  f.cod_sessao_ga                                       AS ga_session_id,
  f.chv_sessao,
  f.nm_campanha                                         AS campaign_name,
  f.nm_variante                                         AS variation_name,
  f.cod_variante                                        AS dy_variation_id,
  f.nm_experiencia                                      AS experience_name,
  f.cod_experiencia                                     AS dy_experience_id,
  f.nm_host,
  -- A CONFIRMAR: ft_teste_ab não tem coluna de plataforma; chv_plataforma_marketing → dim_plataforma_marketing dá WEB/ANDROID/IOS.
  CASE UPPER(p.nm_plataforma)
    WHEN 'ANDROID' THEN 'android'
    WHEN 'IOS'     THEN 'ios'
    ELSE 'site'
  END                                                   AS platform,
  f.dt_timestamp_evento                                 AS exposed_at,
  f.dt_evento                                           AS refdate
FROM `petlove-dataeng-prod-01.dw_corporativo.ft_teste_ab` AS f
LEFT JOIN `petlove-dataeng-prod-01.dw_corporativo.dim_plataforma_marketing` AS p   -- A CONFIRMAR: chave e coluna nm_plataforma
  ON p.chv_plataforma_marketing = f.chv_plataforma_marketing
WHERE f.data_processamento BETWEEN '{{refdate_start}}' AND '{{refdate_end}}'
  AND f.nm_campanha IN ({{campaign_names}})
  AND f.nm_variante IS NOT NULL;
