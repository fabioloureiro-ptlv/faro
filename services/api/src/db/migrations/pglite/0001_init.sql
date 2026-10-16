CREATE TABLE IF NOT EXISTS experiments (
  faro_id text PRIMARY KEY,
  name text NOT NULL,
  bu text NOT NULL,
  owner_squad text NOT NULL,
  owner_email text NOT NULL,
  status text NOT NULL,
  template_id text,
  design jsonb NOT NULL,
  audience jsonb NOT NULL,
  allocation jsonb NOT NULL,
  overlap jsonb,
  dy jsonb,
  decision jsonb,
  legacy boolean NOT NULL DEFAULT false,
  dy_campaign_id text UNIQUE,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS experiments_status_idx ON experiments (status);

CREATE TABLE IF NOT EXISTS faro_id_counters (
  year integer PRIMARY KEY,
  last integer NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment_audit (
  id bigserial PRIMARY KEY,
  faro_id text NOT NULL REFERENCES experiments (faro_id),
  field text NOT NULL,
  before jsonb,
  after jsonb,
  author text NOT NULL,
  at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS experiment_audit_faro_idx ON experiment_audit (faro_id);

CREATE TABLE IF NOT EXISTS domain_events (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  faro_id text NOT NULL,
  event jsonb NOT NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS domain_events_faro_idx ON domain_events (faro_id, type);

CREATE TABLE IF NOT EXISTS metric_requests (
  id bigserial PRIMARY KEY,
  metric_id text NOT NULL UNIQUE,
  definition jsonb NOT NULL,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL
);
