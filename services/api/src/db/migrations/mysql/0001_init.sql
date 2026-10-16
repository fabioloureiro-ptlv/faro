-- Dialeto MySQL 8 (Cloud SQL gerenciado do AppBuilder). Espelha pglite/0001_init.sql.
-- Índices declarados dentro do CREATE TABLE porque o MySQL não tem
-- CREATE INDEX IF NOT EXISTS. Timestamps são varchar ISO-8601 UTC (ver db/schema.ts).

CREATE TABLE IF NOT EXISTS experiments (
  faro_id varchar(32) PRIMARY KEY,
  name text NOT NULL,
  bu varchar(16) NOT NULL,
  owner_squad text NOT NULL,
  owner_email varchar(255) NOT NULL,
  status varchar(32) NOT NULL,
  template_id varchar(64),
  design json NOT NULL,
  audience json NOT NULL,
  allocation json NOT NULL,
  overlap json,
  dy json,
  decision json,
  legacy boolean NOT NULL DEFAULT false,
  dy_campaign_id varchar(64),
  created_at varchar(40) NOT NULL,
  updated_at varchar(40) NOT NULL,
  UNIQUE KEY experiments_dy_campaign_id_uq (dy_campaign_id),
  KEY experiments_status_idx (status)
);

CREATE TABLE IF NOT EXISTS faro_id_counters (
  year int PRIMARY KEY,
  last int NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment_audit (
  id bigint AUTO_INCREMENT PRIMARY KEY,
  faro_id varchar(32) NOT NULL,
  field varchar(255) NOT NULL,
  `before` json,
  `after` json,
  author varchar(255) NOT NULL,
  at varchar(40) NOT NULL,
  KEY experiment_audit_faro_idx (faro_id),
  CONSTRAINT experiment_audit_faro_fk FOREIGN KEY (faro_id) REFERENCES experiments (faro_id)
);

CREATE TABLE IF NOT EXISTS domain_events (
  id bigint AUTO_INCREMENT PRIMARY KEY,
  type varchar(64) NOT NULL,
  faro_id varchar(32) NOT NULL,
  event json NOT NULL,
  occurred_at varchar(40) NOT NULL,
  KEY domain_events_faro_idx (faro_id, type)
);

CREATE TABLE IF NOT EXISTS metric_requests (
  id bigint AUTO_INCREMENT PRIMARY KEY,
  metric_id varchar(191) NOT NULL,
  definition json NOT NULL,
  requested_by varchar(255) NOT NULL,
  requested_at varchar(40) NOT NULL,
  UNIQUE KEY metric_requests_metric_id_uq (metric_id)
);
