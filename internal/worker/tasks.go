package worker

import (
	"encoding/json"

	"github.com/hibiken/asynq"
)

// Görev Adı
const TypePingMonitor = "monitor:ping"

// Görev Verisi (Payload):
// Worker'ın hem ID'ye hem de URL'e ihtiyacı var.
type MonitorTaskPayload struct {
	MonitorID string `json:"monitor_id"`
	URL       string `json:"url"`
}

// Yeni bir görev paketi oluşturan yardımcı fonksiyon
// Artık URL parametresi de alıyor.
func NewPingTask(monitorID string, url string) (*asynq.Task, error) {
	payload, err := json.Marshal(MonitorTaskPayload{
		MonitorID: monitorID,
		URL:       url,
	})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypePingMonitor, payload), nil
}