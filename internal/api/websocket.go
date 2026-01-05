package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Dev ortamı için CORS izni
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// Hub: Bağlı olan tüm kullanıcıları ve mesaj trafiğini yönetir
type Hub struct {
	clients    map[*websocket.Conn]bool
	broadcast  chan []byte
	register   chan *websocket.Conn
	unregister chan *websocket.Conn
	mutex      sync.Mutex
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*websocket.Conn]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *websocket.Conn),
		unregister: make(chan *websocket.Conn),
	}
}

// Run: Hub'ı çalıştıran ana döngü
func (h *Hub) Run() {
	for {
		select {
		case conn := <-h.register:
			h.mutex.Lock()
			h.clients[conn] = true
			h.mutex.Unlock()
			log.Println("🟢 Yeni WebSocket İstemcisi Bağlandı")

		case conn := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[conn]; ok {
				delete(h.clients, conn)
				conn.Close()
			}
			h.mutex.Unlock()
			log.Println("🔴 WebSocket İstemcisi Ayrıldı")

		case message := <-h.broadcast:
			// Gelen mesajı herkese dağıt
			h.mutex.Lock()
			for conn := range h.clients {
				err := conn.WriteMessage(websocket.TextMessage, message)
				if err != nil {
					log.Println("WS Yazma Hatası (Client kopmuş olabilir):", err)
					conn.Close()
					delete(h.clients, conn)
				}
			}
			h.mutex.Unlock()
		}
	}
}

// Broadcast: Dışarıdan mesaj yollamak için helper
func (h *Hub) Broadcast(data interface{}) {
	bytes, err := json.Marshal(data)
	if err != nil {
		log.Println("JSON Marshal hatası:", err)
		return
	}
	h.broadcast <- bytes
}

// ServeWs: HTTP isteğini WebSocket'e çevirir ve Hub'a kaydeder
func (h *Hub) ServeWs(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade hatası:", err)
		return
	}
	h.register <- conn

	// Bağlantı koparsa temizle
	go func() {
		defer func() {
			h.unregister <- conn
		}()
		// Okuma döngüsü (Client kapattığında hatayı yakalamak için gerekli)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}()
}
