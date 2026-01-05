import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
// Dosya yolun sendeki projeye göre değişebilir, sendeki import'u koru
import { MonitorService } from "../gen/proto/pulsar/v1/monitor_connect";

// --- SİHİRLİ DOKUNUŞ BURADA ---
// .env dosyasına bakmak yerine, tarayıcının o anki adresine bakıyoruz.
// Eğer localdeysen "localhost", sunucudaysan "3.121.29.12" gelir.
const host = window.location.hostname;
const protocol = window.location.protocol; // "http:" veya "https:"
const backendPort = "8081";

// Otomatik olarak doğru adresi oluşturuyoruz
const apiUrl = `${protocol}//${host}:${backendPort}`;

console.log("RPC Client API URL:", apiUrl); // Konsoldan kontrol etmek için

const transport = createConnectTransport({
  baseUrl: apiUrl,
});

export const client = createPromiseClient(MonitorService, transport);
