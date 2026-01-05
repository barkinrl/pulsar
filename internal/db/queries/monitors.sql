-- name: CreateMonitor :one
INSERT INTO monitors (url, interval_seconds)
VALUES ($1, $2)
RETURNING *;

-- name: ListMonitors :many
SELECT * FROM monitors
ORDER BY created_at DESC;

-- name: GetMonitorsToPing :many
-- Kontrol zamanı gelmiş (veya hiç kontrol edilmemiş) aktif monitörleri getir
SELECT * FROM monitors
WHERE is_active = true 
AND (last_check IS NULL OR last_check < NOW() - (interval_seconds || ' seconds')::INTERVAL);

-- name: UpdateMonitorLastCheck :exec
UPDATE monitors
SET last_check = NOW()
WHERE id = $1;

-- name: DeleteMonitor :exec
DELETE FROM monitors WHERE id = $1;

-- --- YENİ EKLENENLER (History için) ---

-- name: CreateMonitorResult :one
INSERT INTO monitor_results (
    id,
    monitor_id,
    status_code,
    status,
    latency,
    timing_dns,
    timing_tcp,
    timing_tls,
    timing_ttfb,
    timing_download,
    created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
) RETURNING *;

-- name: GetMonitorResults :many
-- Bir monitörün son 50 kaydını getirir (Grafik için)
SELECT * FROM monitor_results
WHERE monitor_id = $1
ORDER BY created_at DESC
LIMIT 50;

-- name: CleanOldMonitorResults :exec
-- 7 günden eski verileri siler (DB şişmesin diye)
DELETE FROM monitor_results
WHERE created_at < NOW() - INTERVAL '7 days';