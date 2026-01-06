package worker

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptrace"
	"strings"
	"time"

	"github.com/barkinrl/pulsar/internal/db"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"
)

type PingProcessor struct {
	queries *db.Queries
	rdb     *redis.Client
}

func NewPingProcessor(queries *db.Queries, rdb *redis.Client) *PingProcessor {
	return &PingProcessor{
		queries: queries,
		rdb:     rdb,
	}
}


func (p *PingProcessor) HandlePingTask(ctx context.Context, t *asynq.Task) error {
	var payload MonitorTaskPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return err
	}

	targetURL := payload.URL
	if targetURL == "" {
		return nil
	}
	if !strings.HasPrefix(targetURL, "http://") && !strings.HasPrefix(targetURL, "https://") {
		targetURL = "https://" + targetURL
	}

	// --- TRACE VARIABLES ---
	var (
		dnsStart, dnsDone   time.Time
		connStart, connDone time.Time
		tlsStart, tlsDone   time.Time
		gotFirstByte        time.Time
	)

	// Trace Hooks
	trace := &httptrace.ClientTrace{
		DNSStart: func(_ httptrace.DNSStartInfo) { dnsStart = time.Now() },
		DNSDone:  func(_ httptrace.DNSDoneInfo) { dnsDone = time.Now() },
		ConnectStart: func(_, _ string) {
			connStart = time.Now()
		},
		ConnectDone: func(net, addr string, err error) {
			if err == nil {
				connDone = time.Now()
			}
		},
		TLSHandshakeStart: func() { tlsStart = time.Now() },
		TLSHandshakeDone:  func(_ tls.ConnectionState, _ error) { tlsDone = time.Now() },
		GotFirstResponseByte: func() {
			gotFirstByte = time.Now()
		},
	}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		log.Printf("Request creation failed: %v", err)
		return nil
	}
	req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

	// User-Agent Settings
	req.Header.Set("User-Agent", "Pulsar-Monitor/1.0 (Compatible; Go-http-client/1.1; +https://github.com/barkinrl/pulsar)")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Connection", "close") 
	req.Close = true

	// Transport Settings 
	transport := &http.Transport{
		DisableKeepAlives: true,
	}

	client := http.Client{
		Transport: transport,
		Timeout:   10 * time.Second,
	}

	// --- START ---
	start := time.Now()
	resp, err := client.Do(req)

	var totalDuration time.Duration

	statusCode := 0
	status := "DOWN"

	// time calculations
	var dnsDuration, connDuration, tlsDuration, ttfbDuration, downloadDuration float64

	if err == nil {
		statusCode = resp.StatusCode
		status = resp.Status

		// --- OPTIMIZATION ---
		_, copyErr := io.CopyN(io.Discard, resp.Body, 1024)
		resp.Body.Close()

		// EOF error 
		if copyErr != nil && copyErr != io.EOF {
		}

		endTime := time.Now()
		totalDuration = time.Since(start)

		// measure durations
		if !dnsStart.IsZero() && !dnsDone.IsZero() {
			dnsDuration = float64(dnsDone.Sub(dnsStart).Milliseconds())
		}
		if !connStart.IsZero() && !connDone.IsZero() {
			connDuration = float64(connDone.Sub(connStart).Milliseconds())
		}
		if !tlsStart.IsZero() && !tlsDone.IsZero() {
			tlsDuration = float64(tlsDone.Sub(tlsStart).Milliseconds())
		}

		// TTFB Calculation
		if !gotFirstByte.IsZero() {
			if !tlsDone.IsZero() {
				ttfbDuration = float64(gotFirstByte.Sub(tlsDone).Milliseconds())
			} else if !connDone.IsZero() {
				ttfbDuration = float64(gotFirstByte.Sub(connDone).Milliseconds())
			} else {
				ttfbDuration = float64(gotFirstByte.Sub(start).Milliseconds())
			}
		}

		// Download Calculation
		if !gotFirstByte.IsZero() {
			downloadDuration = float64(endTime.Sub(gotFirstByte).Milliseconds())
		}

		if ttfbDuration < 0 {
			ttfbDuration = 0
		}
		if downloadDuration < 0 {
			downloadDuration = 0
		}

	} else {
		// Complete the duration even on error
		totalDuration = time.Since(start)
		log.Printf("Ping failed for %s: %v", targetURL, err)
	}

	// --- 1. POSTGRESQL ---

	var monID pgtype.UUID
	monID.Scan(payload.MonitorID)

	var resID pgtype.UUID
	resID.Scan(uuid.New().String())

	_, dbErr := p.queries.CreateMonitorResult(ctx, db.CreateMonitorResultParams{
		ID:             resID,
		MonitorID:      monID,
		StatusCode:     int32(statusCode),
		Status:         status,
		Latency:        int32(totalDuration.Milliseconds()),
		TimingDns:      int32(dnsDuration),
		TimingTcp:      int32(connDuration),
		TimingTls:      int32(tlsDuration),
		TimingTtfb:     int32(ttfbDuration),
		TimingDownload: int32(downloadDuration),
	})

	if dbErr != nil {
		log.Printf("❌ DB Save Error: %v", dbErr)
	}

	// --- 2. LIVE DATA ---
	updateMsg := map[string]interface{}{
		"type": "monitor_update",
		"data": map[string]interface{}{
			"monitor_id": payload.MonitorID,
			"status":     status,
			"code":       statusCode,
			"latency":    totalDuration.Milliseconds(),
			"timing": map[string]float64{
				"dns":      dnsDuration,
				"connect":  connDuration,
				"tls":      tlsDuration,
				"ttfb":     ttfbDuration,
				"download": downloadDuration,
			},
		},
	}

	msgBytes, _ := json.Marshal(updateMsg)

	if err := p.rdb.Publish(ctx, "pulsar:updates", msgBytes).Err(); err != nil {
		log.Printf("Redis Publish Error: %v", err)
	}

	if err == nil {
		log.Printf("✅ Trace: %s | Total: %dms | DL: %.0fms", targetURL, totalDuration.Milliseconds(), downloadDuration)
	}

	return nil
}