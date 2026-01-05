# Base imaj (Go 1.24)
FROM golang:1.24-alpine

# Çalışma dizini
WORKDIR /app

# Bağımlılıkları kopyala ve indir
COPY go.mod go.sum ./
RUN go mod download

# Kaynak kodun tamamını kopyala
COPY . .

# Backend ve Worker binary'lerini derle
RUN go build -o /app/pulsar-backend cmd/api/main.go
RUN go build -o /app/pulsar-worker cmd/worker/main.go

# Varsayılan portlar (Bilgi amaçlı)
EXPOSE 8080

# Varsayılan komut (Compose dosyasında ezilecek)
CMD ["/app/pulsar-backend"]