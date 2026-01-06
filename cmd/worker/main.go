package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"runtime"
	"time"

	"github.com/barkinrl/pulsar/internal/db"
	"github.com/barkinrl/pulsar/internal/worker"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	// Gopsutil Packages for System Stats
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)


var (
	prevNetTime   time.Time
	prevBytesRecv uint64
	prevBytesSent uint64
)

func main() {
	// 1. DB Conn
	dbUrl := os.Getenv("DATABASE_URL")
	if dbUrl == "" {
		dbUrl = "postgres://pulsar_user:pulsar_password@localhost:5432/pulsar_db?sslmode=disable"
	}

	poolConfig, err := pgxpool.ParseConfig(dbUrl)
	if err != nil {
		log.Fatalf("DB Config hatası: %v", err)
	}
	poolConfig.MaxConns = 20
	poolConfig.MinConns = 2
	poolConfig.MaxConnLifetime = time.Hour
	poolConfig.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		log.Fatalf("Veritabanı havuzu oluşturulamadı: %v", err)
	}
	defer pool.Close()

	queries := db.New(pool)
	log.Println("✅ Worker veritabanı havuzuna (Pool) bağlandı")

	// 2. Redis Conn
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	// Asynq Redis Client Opt
	asynqRedisOpt := asynq.RedisClientOpt{Addr: redisAddr}

	// Pub/Sub and System Stats for Redis Client
	rdb := redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})

	// --- PART A: SCHEDULER ---
	poller := worker.NewPoller(queries, asynqRedisOpt)
	go poller.Start(context.Background(), 10*time.Second)

	// --- PART B: SYSTEM MONITOR  ---
	go startSystemMonitor(queries, rdb)

	// --- PART C: WORKER SERVER ---
	srv := asynq.NewServer(
		asynqRedisOpt,
		asynq.Config{
			Concurrency: 10,
			Queues: map[string]int{
				"default": 1,
			},
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				log.Printf("HATA: Task işlenirken sorun oluştu: %v", err)
			}),
		},
	)

	mux := asynq.NewServeMux()

	processor := worker.NewPingProcessor(queries, rdb)
	mux.HandleFunc(worker.TypePingMonitor, processor.HandlePingTask)

	log.Printf("👷 Worker Server started... (Redis: %s)", redisAddr)
	if err := srv.Run(mux); err != nil {
		log.Fatal(err)
	}
}

// --- HELPER: Process States ---
func getProcessStates() (total, running, sleeping, zombie int32) {
	procs, err := process.Processes()
	if err != nil {
		return int32(runtime.NumGoroutine()), int32(runtime.NumGoroutine()), 0, 0
	}

	total = int32(len(procs))
	for _, p := range procs {
		status, err := p.Status() // []string 
		if err != nil || len(status) == 0 {
			continue
		}

		// String karşılaştırması
		switch status[0] {
		case "R":
			running++
		case "S", "I":
			sleeping++
		case "Z", "T", "L":
			zombie++
		default:
			sleeping++
		}
	}
	return
}

// --- SYSTEM MONITOR ---
func startSystemMonitor(queries *db.Queries, rdb *redis.Client) {
	n, _ := net.IOCounters(false)
	if len(n) > 0 {
		prevBytesRecv = n[0].BytesRecv
		prevBytesSent = n[0].BytesSent
		prevNetTime = time.Now()
	}

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	const THREAD_ALARM_THRESHOLD = 3000

	for range ticker.C {
		// Verileri Topla
		v, _ := mem.VirtualMemory()
		c, _ := cpu.Percent(0, false)
		d, _ := disk.Usage("/")
		n, _ := net.IOCounters(false)
		h, _ := host.Info() // Uptime and OS 

		// Thread Analysis
		tTotal, tRun, tSleep, tZombie := getProcessStates()

		cpuVal := 0.0
		if len(c) > 0 {
			cpuVal = c[0]
		}

		// Network Hızı Hesaplama
		networkSpeedKB := 0.0
		if len(n) > 0 {
			now := time.Now()
			duration := now.Sub(prevNetTime).Seconds()
			if duration > 0 {
				deltaRecv := float64(n[0].BytesRecv - prevBytesRecv)
				deltaSent := float64(n[0].BytesSent - prevBytesSent)
				// (Byte / Sec) / 1024 => KB/s
				networkSpeedKB = ((deltaRecv + deltaSent) / duration) / 1024
			}
			prevBytesRecv = n[0].BytesRecv
			prevBytesSent = n[0].BytesSent
			prevNetTime = now
		}

		// 1. DB storage
		ctx := context.Background()
		_, err := queries.CreateSystemStat(ctx, db.CreateSystemStatParams{
			CpuPercent:      cpuVal,
			MemoryPercent:   v.UsedPercent,
			DiskPercent:     d.UsedPercent,
			NetKbS:          networkSpeedKB,
			ThreadsTotal:    tTotal,
			ThreadsRunning:  tRun,
			ThreadsSleeping: tSleep,
			ThreadsZombie:   tZombie,
		})
		if err != nil {
			log.Printf("⚠️ System Stat DB Error: %v", err)
		}

		// 2. Redis Pub/Sub 
		isWarning := tTotal > THREAD_ALARM_THRESHOLD

		payload := map[string]interface{}{
			"type": "system",
			"data": map[string]interface{}{
				"cpu": map[string]interface{}{
					"percent": cpuVal,
				},
				"memory": map[string]interface{}{
					"percent": v.UsedPercent,
					"used":    float64(v.Used) / 1024 / 1024 / 1024,
					"total":   float64(v.Total) / 1024 / 1024 / 1024,
				},
				"disk": map[string]interface{}{
					"percent": d.UsedPercent,
					"used":    float64(d.Used) / 1024 / 1024 / 1024,
					"total":   float64(d.Total) / 1024 / 1024 / 1024,
				},
				"network": map[string]interface{}{
					"used": networkSpeedKB,
				},
				"threads": map[string]interface{}{
					"total":      tTotal,
					"running":    tRun,
					"sleeping":   tSleep,
					"zombie":     tZombie,
					"is_warning": isWarning,
				},
				"uptime": h.Uptime,
				"os":     h.Platform,
			},
		}

		msgBytes, _ := json.Marshal(payload)
		rdb.Publish(ctx, "pulsar:updates", msgBytes)
	}
}