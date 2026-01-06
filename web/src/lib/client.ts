import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

import { MonitorService } from "../gen/proto/pulsar/v1/monitor_connect";

const host = window.location.hostname;
const protocol = window.location.protocol; // "http:" or "https:"
const backendPort = "8081";

const apiUrl = `${protocol}//${host}:${backendPort}`;

console.log("RPC Client API URL:", apiUrl);
const transport = createConnectTransport({
  baseUrl: apiUrl,
});

export const client = createPromiseClient(MonitorService, transport);
