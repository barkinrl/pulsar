package worker

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/barkinrl/pulsar/internal/db"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
)

// Poller: Veritabanını tarayıp iş çıkaran yapı
type Poller struct {
	queries *db.Queries
	client  *asynq.Client
}

func NewPoller(queries *db.Queries, redisOpt asynq.RedisClientOpt) *Poller {
	client := asynq.NewClient(redisOpt)
	return &Poller{
		queries: queries,
		client:  client,
	}
}

// Start: Sonsuz döngüyü başlatır
func (p *Poller) Start(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	log.Println("⏱️  Scheduler (Poller) başlatıldı...")

	for {
		select {
		case <-ctx.Done():
			log.Println("Scheduler durduruluyor...")
			return
		case <-ticker.C:
			p.enqueueDueMonitors(ctx)
		}
	}
}

func (p *Poller) enqueueDueMonitors(ctx context.Context) {
	// 1. Zamanı gelmiş monitörleri bul
	// Not: sqlc generate ayarlarına göre bu fonksiyonun adı 'ListMonitorsToCheck' de olabilir.
	// Senin kodunda 'GetMonitorsToPing' olduğu için onu korudum.
	monitors, err := p.queries.GetMonitorsToPing(ctx)
	if err != nil {
		log.Printf("Hata: Monitörler çekilemedi: %v", err)
		return
	}

	if len(monitors) == 0 {
		return // Yapılacak iş yok
	}

	log.Printf("🔎 %d adet izlenecek site bulundu, kuyruğa atılıyor...", len(monitors))

	// 2. Her biri için Redis'e görev at
	for _, m := range monitors {
		// DÜZELTME: Artık URL'i de gönderiyoruz!
		task, err := NewPingTask(pgUUIDToString(m.ID), m.Url)
		if err != nil {
			log.Printf("Task oluşturma hatası: %v", err)
			continue
		}

		// Task ID'yi unique yaparak duplicate önleyebiliriz ama şimdilik basit tutalım
		info, err := p.client.Enqueue(task)
		if err != nil {
			log.Printf("Redis kuyruk hatası: %v", err)
		} else {
			log.Printf("Task kuyruğa atıldı: %s (URL: %s)", info.ID, m.Url)
		}
	}
}

// Yardımcı fonksiyon
func pgUUIDToString(uuid pgtype.UUID) string {
	if !uuid.Valid {
		return ""
	}
	src := uuid.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", src[0:4], src[4:6], src[6:8], src[8:10], src[10:16])
}