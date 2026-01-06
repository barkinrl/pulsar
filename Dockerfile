FROM golang:1.24-alpine

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o /app/pulsar-backend cmd/api/main.go
RUN go build -o /app/pulsar-worker cmd/worker/main.go

EXPOSE 8080

CMD ["/app/pulsar-backend"]