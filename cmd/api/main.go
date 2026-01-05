package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"github.com/barkinrl/pulsar/gen/go/proto/pulsar/v1/v1connect"
	"github.com/barkinrl/pulsar/internal/api"
	"github.com/barkinrl/pulsar/internal/db"
	"github.com/barkinrl/pulsar/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	// 1. Veritabanı Bağlantısı
	dbUrl := os.Getenv("DATABASE_URL")
	if dbUrl == "" {
		dbUrl = "postgres://pulsar_user:pulsar_password@localhost:5432/pulsar_db?sslmode=disable"
	}
	pool := connectToDB(dbUrl)
	defer pool.Close()

	// 2. Redis Bağlantısı
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	rdb := redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Printf("⚠️ Redis hatası: %v", err)
	}

	// 3. WebSocket Hub Başlat
	hub := api.NewHub()
	go hub.Run()

	// 4. Redis Listener (KÖPRÜ GÖREVİ)
	// Worker'dan gelen (Ping veya System Stat) mesajları dinler ve WebSocket'e basar
	go func() {
		ctx := context.Background()
		subscriber := rdb.Subscribe(ctx, "pulsar:updates")
		defer subscriber.Close()
		for msg := range subscriber.Channel() {
			hub.Broadcast(json.RawMessage(msg.Payload))
		}
	}()

	// 5. DB Queries Oluştur
	queries := db.New(pool)

	// 6. Service ve Handler Kurulumu
	monitorServer := service.NewMonitorServer(queries)
	path, handler := v1connect.NewMonitorServiceHandler(monitorServer)

	mux := http.NewServeMux()
	mux.Handle(path, handler)
	mux.HandleFunc("/ws", hub.ServeWs)

	// 7. CORS Ayarları (GÜNCELLENDİ)
	// Artık "*" diyerek gelen tüm isteklere izin veriyoruz.
	// Bu sayede EC2 IP'sinden gelen istekler reddedilmeyecek.
	corsHandler := cors.New(cors.Options{
		AllowedOrigins: []string{"*"}, // <--- KRİTİK DEĞİŞİKLİK BURADA
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{
			"Accept",
			"Authorization",
			"Content-Type",
			"X-CSRF-Token",
			"Connect-Protocol-Version",
			"Grpc-Timeout",
			"*",
		},
		ExposedHeaders:   []string{"Grpc-Status", "Grpc-Message", "Grpc-Status-Details-Bin"},
		AllowCredentials: true,
		Debug:            true, // Hata ayıklamak için logları açtık
	})

	port := "8080"
	fmt.Printf("🚀 Server is running on http://0.0.0.0:%s\n", port)
	fmt.Printf("📡 WebSocket available at ws://0.0.0.0:%s/ws\n", port)

	server := &http.Server{
		Addr:    "0.0.0.0:" + port,
		Handler: h2c.NewHandler(corsHandler.Handler(mux), &http2.Server{}),
	}

	if err := server.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

// connectToDB
func connectToDB(dbUrl string) *pgxpool.Pool {
	var counts int64
	var backOff = 1 * time.Second
	var pool *pgxpool.Pool
	var err error

	for {
		config, parseErr := pgxpool.ParseConfig(dbUrl)
		if parseErr != nil {
			log.Println("DB Config hatası, bekleniyor...")
		} else {
			pool, err = pgxpool.NewWithConfig(context.Background(), config)
			if err == nil {
				err = pool.Ping(context.Background())
				if err == nil {
					log.Println("✅ Veritabanına başarıyla bağlanıldı!")
					return pool
                }
            }
        }

        if counts > 10 {
            log.Printf("❌ Veritabanına %d kere denendi ama bağlanılamadı. Kapatılıyor.\n", counts)
            log.Fatal(err)
        }

        counts++
        log.Printf("⏳ Veritabanı bekleniyor... (Deneme %d) Hata: %v\n", counts, err)
        time.Sleep(backOff)
        backOff = backOff + 2*time.Second
    }
}