-- 1. UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Monitors Tables
CREATE TABLE IF NOT EXISTS monitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_check TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Monitor Results (Ping & Waterfall)
CREATE TABLE IF NOT EXISTS monitor_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    monitor_id UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
    
    status_code INTEGER NOT NULL,
    status TEXT NOT NULL,
    latency INTEGER NOT NULL,
    
    -- Waterfall (Trace) 
    timing_dns INTEGER NOT NULL DEFAULT 0,
    timing_tcp INTEGER NOT NULL DEFAULT 0,
    timing_tls INTEGER NOT NULL DEFAULT 0,
    timing_ttfb INTEGER NOT NULL DEFAULT 0,
    timing_download INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Monitor Indexes 
CREATE INDEX IF NOT EXISTS idx_results_monitor_id_created ON monitor_results(monitor_id, created_at DESC);

-- 5. SYSTEM STATS 
CREATE TABLE IF NOT EXISTS system_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source Usages    
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

-- 6. System Stats Indexes
CREATE INDEX IF NOT EXISTS idx_system_stats_created ON system_stats(created_at DESC);