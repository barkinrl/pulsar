package service

import (
	"context"
	"fmt"
	"math"
	"os"
	"runtime"
	"time"

	"connectrpc.com/connect"
	// Proto messages
	pulsarv1 "github.com/barkinrl/pulsar/gen/go/proto/pulsar/v1"
	"github.com/barkinrl/pulsar/gen/go/proto/pulsar/v1/v1connect"

	"github.com/barkinrl/pulsar/internal/db"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
	"google.golang.org/protobuf/types/known/emptypb"
)

// MonitorServer, Protobuf'ta tanımladığımız sunucu arayüzünü implemente eder.
type MonitorServer struct {
	queries *db.Queries
	v1connect.UnimplementedMonitorServiceHandler
}

// NewMonitorServer, yeni bir servis örneği oluşturur.
func NewMonitorServer(queries *db.Queries) *MonitorServer {
	return &MonitorServer{queries: queries}
}

// CreateMonitor... (Aynı)
func (s *MonitorServer) CreateMonitor(
	ctx context.Context,
	req *connect.Request[pulsarv1.CreateMonitorRequest],
) (*connect.Response[pulsarv1.CreateMonitorResponse], error) {
	createdMonitor, err := s.queries.CreateMonitor(ctx, db.CreateMonitorParams{
		Url:             req.Msg.Url,
		IntervalSeconds: req.Msg.IntervalSeconds,
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	responseMonitor := &pulsarv1.Monitor{
		Id:              pgUUIDToString(createdMonitor.ID),
		Url:             createdMonitor.Url,
		IntervalSeconds: createdMonitor.IntervalSeconds,
		IsActive:        createdMonitor.IsActive,
	}
	return connect.NewResponse(&pulsarv1.CreateMonitorResponse{
		Monitor: responseMonitor,
	}), nil
}

// ListMonitors... (Aynı)
func (s *MonitorServer) ListMonitors(
	ctx context.Context,
	req *connect.Request[pulsarv1.ListMonitorsRequest],
) (*connect.Response[pulsarv1.ListMonitorsResponse], error) {
	monitors, err := s.queries.ListMonitors(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	var protoMonitors []*pulsarv1.Monitor
	for _, m := range monitors {
		protoMonitors = append(protoMonitors, &pulsarv1.Monitor{
			Id:              pgUUIDToString(m.ID),
			Url:             m.Url,
			IntervalSeconds: m.IntervalSeconds,
			IsActive:        m.IsActive,
		})
	}
	return connect.NewResponse(&pulsarv1.ListMonitorsResponse{
		Monitors: protoMonitors,
	}), nil
}

// GetMonitorStats... (Aynı)
func (s *MonitorServer) GetMonitorStats(
	ctx context.Context,
	req *connect.Request[pulsarv1.GetMonitorStatsRequest],
) (*connect.Response[pulsarv1.GetMonitorStatsResponse], error) {
	var monitorID pgtype.UUID
	if err := monitorID.Scan(req.Msg.MonitorId); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("geçersiz ID formatı"))
	}
	results, err := s.queries.GetMonitorResults(ctx, monitorID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	var stats []*pulsarv1.MonitorStat
	for _, r := range results {
		stats = append(stats, &pulsarv1.MonitorStat{
			Latency: r.Latency,
			Code:    r.StatusCode,
			Status:  r.Status,
			Time:    r.CreatedAt.Time.Format(time.RFC3339),
			Timing: &pulsarv1.MonitorTiming{
				Dns:      r.TimingDns,
				Tcp:      r.TimingTcp,
				Tls:      r.TimingTls,
				Ttfb:     r.TimingTtfb,
				Download: r.TimingDownload,
			},
		})
	}
	return connect.NewResponse(&pulsarv1.GetMonitorStatsResponse{
		Stats: stats,
	}), nil
}

// DeleteMonitor... (Aynı)
func (s *MonitorServer) DeleteMonitor(
	ctx context.Context,
	req *connect.Request[pulsarv1.DeleteMonitorRequest],
) (*connect.Response[pulsarv1.DeleteMonitorResponse], error) {
	var monitorID pgtype.UUID
	if err := monitorID.Scan(req.Msg.MonitorId); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("geçersiz ID formatı"))
	}
	err := s.queries.DeleteMonitor(ctx, monitorID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&pulsarv1.DeleteMonitorResponse{
		Success: true,
	}), nil
}

// GetSystemStats... (Process Analizi Düzeltildi)
func (s *MonitorServer) GetSystemStats(
	ctx context.Context,
	req *connect.Request[emptypb.Empty],
	stream *connect.ServerStream[pulsarv1.SystemStatsResponse],
) error {
	hostInfo, _ := host.Info()

	// --- 1. GEÇMİŞ VERİYİ ÇEK VE GÖNDER ---
	history, err := s.queries.GetSystemStatHistory(ctx)
	if err == nil && len(history) > 0 {
		var cpuHist, memHist, diskHist, netHist []float64
		var threadHist []*pulsarv1.ThreadHistory

		for i := len(history) - 1; i >= 0; i-- {
			h := history[i]
			cpuHist = append(cpuHist, h.CpuPercent)
			memHist = append(memHist, h.MemoryPercent)
			diskHist = append(diskHist, h.DiskPercent)
			netHist = append(netHist, h.NetKbS)

			threadHist = append(threadHist, &pulsarv1.ThreadHistory{
				Running:  h.ThreadsRunning,
				Sleeping: h.ThreadsSleeping,
				Zombie:   h.ThreadsZombie,
				Time:     h.CreatedAt.Time.Format("15:04:05"),
			})
		}

		initialResp := &pulsarv1.SystemStatsResponse{
			Cpu:     &pulsarv1.ResourceUsage{History: cpuHist},
			Memory:  &pulsarv1.ResourceUsage{History: memHist},
			Disk:    &pulsarv1.ResourceUsage{History: diskHist},
			Network: &pulsarv1.ResourceUsage{History: netHist},
			Threads: &pulsarv1.ThreadUsage{History: threadHist},
			Info: &pulsarv1.SystemInfo{
				Hostname:        hostInfo.Hostname,
				Os:              hostInfo.OS,
				Platform:        hostInfo.Platform,
				PlatformVersion: hostInfo.PlatformVersion,
				UptimeSeconds:   hostInfo.Uptime,
			},
		}
		stream.Send(initialResp)
	}

	// --- 2. CANLI AKIŞ ---
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	var prevNetStat *net.IOCountersStat

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			// --- KAYNAKLAR ---
			cpuPercents, err := cpu.Percent(0, false)
			cpuUsage := 0.0
			if err == nil && len(cpuPercents) > 0 {
				cpuUsage = cpuPercents[0]
			}

			memStat, _ := mem.VirtualMemory()

			diskPath := os.Getenv("ROOT_FS")
			if diskPath == "" {
				diskPath = "/"
			}
			diskStat, _ := disk.Usage(diskPath)

			// --- NETWORK HIZI ---
			netStats, _ := net.IOCounters(false)
			netSpeed := 0.0
			if len(netStats) > 0 {
				currentNet := netStats[0]
				if prevNetStat != nil {
					diff := (currentNet.BytesRecv + currentNet.BytesSent) - (prevNetStat.BytesRecv + prevNetStat.BytesSent)
					netSpeed = float64(diff) / 15.0 / 1024.0 // KB/s
				}
				prevNetStat = &currentNet
			}

			// --- DETAYLI THREAD ANALİZİ (DÜZELTİLDİ) ---
			tTotal, tRun, tSleep, tZombie := getServiceProcessStates()
			const THREAD_ALARM_THRESHOLD = 3000

			response := &pulsarv1.SystemStatsResponse{
				Cpu: &pulsarv1.ResourceUsage{
					Used:      toFixed(cpuUsage, 1),
					Total:     100,
					Percent:   toFixed(cpuUsage, 1),
					Unit:      "%",
					IsWarning: cpuUsage > 80,
				},
				Memory: &pulsarv1.ResourceUsage{
					Used:      bytesToGB(memStat.Used),
					Total:     bytesToGB(memStat.Total),
					Percent:   toFixed(memStat.UsedPercent, 1),
					Unit:      "GB",
					IsWarning: memStat.UsedPercent > 90,
				},
				Disk: &pulsarv1.ResourceUsage{
					Used:      bytesToGB(diskStat.Used),
					Total:     bytesToGB(diskStat.Total),
					Percent:   toFixed(diskStat.UsedPercent, 1),
					Unit:      "GB",
					IsWarning: diskStat.UsedPercent > 95,
				},
				Network: &pulsarv1.ResourceUsage{
					Used:      toFixed(netSpeed, 1),
					Total:     0,
					Percent:   0,
					Unit:      "KB/s",
					IsWarning: false,
				},
				Threads: &pulsarv1.ThreadUsage{
					Total:     tTotal,
					Running:   tRun,
					Sleeping:  tSleep,
					Zombie:    tZombie,
					IsWarning: tTotal > THREAD_ALARM_THRESHOLD,
				},
			}

			if err := stream.Send(response); err != nil {
				return err
			}
		}
	}
}

// --- YARDIMCI FONKSİYONLAR ---

// --- DÜZELTME BURADA: String Karşılaştırması ---
func getServiceProcessStates() (total, running, sleeping, zombie int32) {
	procs, err := process.Processes()
	if err != nil {
		return int32(runtime.NumGoroutine()), int32(runtime.NumGoroutine()), 0, 0
	}

	total = int32(len(procs))
	for _, p := range procs {
		status, err := p.Status()
		if err != nil || len(status) == 0 {
			continue
		}
		
		// Byte çevirimi ([0]) yerine direkt String ("R") kullan
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

func pgUUIDToString(uuid pgtype.UUID) string {
	if !uuid.Valid {
		return ""
	}
	src := uuid.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", src[0:4], src[4:6], src[6:8], src[8:10], src[10:16])
}

func toFixed(num float64, precision int) float64 {
	output := math.Pow(10, float64(precision))
	return math.Round(num*output) / output
}

func bytesToGB(bytes uint64) float64 {
	return toFixed(float64(bytes)/1024/1024/1024, 1)
}