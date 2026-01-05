-- name: CreateSystemStat :one
INSERT INTO system_stats (
    cpu_percent, 
    memory_percent, 
    disk_percent, 
    net_kb_s,
    threads_total,
    threads_running,
    threads_sleeping,
    threads_zombie
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetSystemStatHistory :many
SELECT * FROM system_stats
ORDER BY created_at DESC
LIMIT 100; -- Grafik daha geniş görünsün diye 100 yaptık

-- name: CleanOldSystemStats :exec
-- Veriyi 6 ay sakla (Best Practice: Uzun dönem analiz için)
DELETE FROM system_stats
WHERE created_at < NOW() - INTERVAL '6 months';