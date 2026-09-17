-- Olist Analytics Studio - Database Initialization
-- This file runs on first PostgreSQL startup via docker-entrypoint-initdb.d

-- Create schemas
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS app;

-- Dataset version tracking
CREATE TABLE IF NOT EXISTS app.dataset_versions (
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url TEXT NOT NULL,
    source_checksum TEXT NOT NULL,
    file_checksums JSONB NOT NULL,
    row_counts JSONB NOT NULL,
    purchase_date_min DATE,
    purchase_date_max DATE,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    migration_version TEXT NOT NULL
);

-- Active dataset version pointer
CREATE TABLE IF NOT EXISTS app.active_dataset (
    id INT PRIMARY KEY DEFAULT 1,
    dataset_version_id UUID NOT NULL REFERENCES app.dataset_versions(version_id),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_active CHECK (id = 1)
);

COMMENT ON SCHEMA raw IS 'Raw imported Olist CSV data';
COMMENT ON SCHEMA analytics IS 'Pre-aggregated analytical foundations';
COMMENT ON SCHEMA app IS 'Application persistence (analyses, pins, refresh)';
