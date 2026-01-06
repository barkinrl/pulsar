package worker

import (
	"encoding/json"

	"github.com/hibiken/asynq"
)


const TypePingMonitor = "monitor:ping"


type MonitorTaskPayload struct {
	MonitorID string `json:"monitor_id"`
	URL       string `json:"url"`
}

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