-- +goose Up
-- SQL in section 'Up' is executed when this migration is applied

-- UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Monitors TABLE
CREATE TABLE monitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    interval_seconds INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_check TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2. Monitor Results (Ping & Waterfall)
CREATE TABLE monitor_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    
    status_code INT NOT NULL,
    status TEXT NOT NULL,
    latency INT NOT NULL,
    
    -- Waterfall Details
    timing_dns INT NOT NULL DEFAULT 0,
    timing_tcp INT NOT NULL DEFAULT 0,
    timing_tls INT NOT NULL DEFAULT 0,
    timing_ttfb INT NOT NULL DEFAULT 0,
    timing_download INT NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_results_monitor_id_created ON monitor_results(monitor_id, created_at DESC);

-- 3. SYSTEM STATS TABLE
CREATE TABLE IF NOT EXISTS system_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source Usage
    cpu_percent DOUBLE PRECISION NOT NULL,
    memory_percent DOUBLE PRECISION NOT NULL,
    disk_percent DOUBLE PRECISION NOT NULL,
    net_kb_s DOUBLE PRECISION NOT NULL,
    
    -- Thread Details
    threads_total INTEGER NOT NULL DEFAULT 0,
    threads_running INTEGER NOT NULL DEFAULT 0,
    threads_sleeping INTEGER NOT NULL DEFAULT 0,
    threads_zombie INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_stats_created ON system_stats(created_at DESC);


-- +goose Down
-- SQL in section 'Down' is executed when this migration is rolled back

DROP TABLE IF EXISTS system_stats;    
DROP TABLE IF EXISTS monitor_results;
DROP TABLE IF EXISTS pings;
DROP TABLE IF EXISTS monitors;