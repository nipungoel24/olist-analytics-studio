-- App persistence tables

CREATE TABLE IF NOT EXISTS app.analyses (
    analysis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_question TEXT NOT NULL,
    executable_plan JSONB,
    agent_mode TEXT NOT NULL CHECK (agent_mode IN ('llm', 'fallback')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.analysis_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES app.analyses(analysis_id) ON DELETE CASCADE,
    data_version TEXT NOT NULL,
    resolved_filters JSONB,
    assumptions TEXT[],
    data_snapshot JSONB,
    chart_options JSONB,
    insight TEXT,
    warnings TEXT[],
    status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'empty', 'unsupported', 'error')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.pins (
    pin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES app.analyses(analysis_id) ON DELETE CASCADE,
    latest_snapshot_id UUID NOT NULL REFERENCES app.analysis_snapshots(snapshot_id),
    chosen_chart_option INT DEFAULT 0,
    plan_version INT DEFAULT 1,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.refresh_runs (
    refresh_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pin_id UUID NOT NULL REFERENCES app.pins(pin_id) ON DELETE CASCADE,
    previous_snapshot_id UUID REFERENCES app.analysis_snapshots(snapshot_id),
    new_snapshot_id UUID REFERENCES app.analysis_snapshots(snapshot_id),
    status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'not_comparable')),
    semantic_diff JSONB,
    failure_reason TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_snapshots_analysis_id ON app.analysis_snapshots(analysis_id);
CREATE INDEX IF NOT EXISTS idx_pins_latest_snapshot ON app.pins(latest_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_refresh_runs_pin_id ON app.refresh_runs(pin_id);
