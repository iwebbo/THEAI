-- THEAI : schema CVE (NVD + CISA KEV + EPSS). Idempotent.
-- Applique automatiquement au demarrage du backend (core/cve_schema.py).
-- Application manuelle possible sur une base existante :
--   psql -U <user> -d <db> -f cve_schema.sql
-- IMPORTANT : ne pas introduire le caractere pourcent dans ce fichier (execute tel quel par psycopg2).

CREATE SCHEMA IF NOT EXISTS cve;

CREATE TABLE IF NOT EXISTS cve.entries (
    cve_id          text PRIMARY KEY,
    published       timestamptz,
    last_modified   timestamptz,
    description     text,
    cvss_base       numeric(3,1),
    severity        text,
    cvss_vector     text,
    attack_vector   text,
    epss_score      numeric(6,5),
    epss_percentile numeric(6,5),
    kev             boolean NOT NULL DEFAULT false,
    kev_date_added  date,
    kev_due_date    date,
    kev_ransomware  boolean NOT NULL DEFAULT false,
    kev_action      text,
    cwe             text[] NOT NULL DEFAULT '{}',
    vendors         text[] NOT NULL DEFAULT '{}',
    products        text[] NOT NULL DEFAULT '{}',
    refs            text[] NOT NULL DEFAULT '{}',
    affected        jsonb  NOT NULL DEFAULT '[]'::jsonb,
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cve_entries_published ON cve.entries (published DESC);
CREATE INDEX IF NOT EXISTS ix_cve_entries_cvss      ON cve.entries (cvss_base DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_cve_entries_epss      ON cve.entries (epss_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_cve_entries_severity  ON cve.entries (severity);
CREATE INDEX IF NOT EXISTS ix_cve_entries_kev       ON cve.entries (kev_date_added DESC) WHERE kev;
CREATE INDEX IF NOT EXISTS ix_cve_entries_products  ON cve.entries USING gin (products);
CREATE INDEX IF NOT EXISTS ix_cve_entries_vendors   ON cve.entries USING gin (vendors);
CREATE INDEX IF NOT EXISTS ix_cve_entries_fts       ON cve.entries USING gin (to_tsvector('english', description));

-- Curseur de synchronisation NVD (derniere modification ingeree)
CREATE TABLE IF NOT EXISTS cve.sync_state (
    name       text PRIMARY KEY,
    cursor_ts  timestamptz,
    mode       text,
    indexed    bigint,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Une ligne par execution de l'ingestor (panneaux de fraicheur Grafana)
CREATE TABLE IF NOT EXISTS cve.ingest_runs (
    id           bigserial PRIMARY KEY,
    run_at       timestamptz NOT NULL DEFAULT now(),
    mode         text NOT NULL,
    success      boolean NOT NULL,
    duration_s   real,
    fetched      bigint,
    indexed      bigint,
    api_requests integer,
    cursor_ts    timestamptz,
    total_cve    bigint,
    kev_count    bigint,
    size_mb      real,
    error        text
);

CREATE INDEX IF NOT EXISTS ix_cve_ingest_runs_run_at ON cve.ingest_runs (run_at DESC);
