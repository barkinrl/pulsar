import { useEffect, useState, useRef, useMemo } from "react"; // useMemo eklendi
import { client } from "./lib/client";
import type { Monitor } from "./gen/proto/pulsar/v1/monitor_pb";
import { MonitorWidget } from "./components/MonitorWidget";
import { SystemWidget } from "./components/SystemWidget";
import { ThreadWidget } from "./components/ThreadWidget";
import { Plus, Cpu, HardDrive, Activity, Wifi, LayoutGrid } from "lucide-react";

interface WSMessage {
  type: "system" | "monitor_update";
  data: any;
}

interface HistoryData {
  cpu: number[];
  ram: number[];
  disk: number[];
  network: number[];
  threads: {
    running: number;
    sleeping: number;
    zombie: number;
    time: string;
  }[];
}

export type MonitorWithChildren = Monitor & {
  children?: Monitor[];
};

function App() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [lastMonitorUpdate, setLastMonitorUpdate] = useState<
    Record<string, any>
  >({});
  const [systemStats, setSystemStats] = useState<any>(null);
  const [historyStats, setHistoryStats] = useState<HistoryData | null>(null);

  const [url, setUrl] = useState("");
  const [interval, setIntervalVal] = useState(5);
  const [loading, setLoading] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  // --- GROUPING LOGIC ---
  const getGroupedMonitors = (flatList: Monitor[]): MonitorWithChildren[] => {
    const sorted = [...flatList].sort((a, b) => a.url.length - b.url.length);

    const groups: MonitorWithChildren[] = [];
    const processedIds = new Set<string>();

    sorted.forEach((parent) => {
      if (processedIds.has(parent.id)) return;

      const children = sorted.filter(
        (child) =>
          child.id !== parent.id &&
          !processedIds.has(child.id) &&
          child.url.startsWith(parent.url + "/")
      );

      children.forEach((c) => processedIds.add(c.id));
      processedIds.add(parent.id);

      groups.push({ ...parent, children } as any);
    });

    return groups;
  };

  const groupedMonitors = getGroupedMonitors(monitors);

  // --- 1. HISTORY DATA ---
  useEffect(() => {
    const controller = new AbortController();
    const fetchHistory = async () => {
      try {
        const stream = client.getSystemStats({}, { signal: controller.signal });
        for await (const resp of stream) {
          if (resp.cpu?.history && resp.cpu.history.length > 0) {
            setHistoryStats({
              cpu: resp.cpu.history,
              ram: resp.memory?.history || [],
              disk: resp.disk?.history || [],
              network: resp.network?.history || [],
              threads:
                resp.threads?.history.map((h: any) => ({
                  running: h.running,
                  sleeping: h.sleeping,
                  zombie: h.zombie,
                  time: h.time,
                })) || [],
            });
          }
          break;
        }
      } catch (e) {
        console.error("Failed to fetch system history:", e);
      }
    };
    fetchHistory();
    return () => controller.abort();
  }, []);

  // --- RENDER TIME ---
  const ramHistoryInGB = useMemo(() => {
    const total = systemStats?.memory?.total || 0;
    if (!historyStats?.ram || total === 0) return [];
    return historyStats.ram.map((percent) => (percent * total) / 100);
  }, [historyStats?.ram, systemStats?.memory?.total]);

  const diskHistoryInGB = useMemo(() => {
    const total = systemStats?.disk?.total || 0;
    if (!historyStats?.disk || total === 0) return [];
    return historyStats.disk.map((percent) => (percent * total) / 100);
  }, [historyStats?.disk, systemStats?.disk?.total]);

  // --- 2. WEBSOCKET ---
  useEffect(() => {
    if (
      ws.current &&
      (ws.current.readyState === WebSocket.OPEN ||
        ws.current.readyState === WebSocket.CONNECTING)
    )
      return;

    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8081";
    const wsUrl = apiUrl.replace(/^http/, "ws") + "/ws";

    console.log("Connecting to WebSocket:", wsUrl);

    const socket = new WebSocket(wsUrl);
    ws.current = socket;

    socket.onopen = () => setWsConnected(true);
    socket.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === "system") {
          setSystemStats(msg.data);
        } else if (msg.type === "monitor_update") {
          setLastMonitorUpdate((prev) => ({
            ...prev,
            [msg.data.monitor_id]: msg.data,
          }));
        }
      } catch (e) {
        console.error("WS Parse Error", e);
      }
    };
    socket.onclose = () => {
      setWsConnected(false);
      ws.current = null;
    };
    socket.onerror = (error) => {
      console.error("WS Error:", error);
      socket.close();
    };

    return () => {
      if (socket.readyState === WebSocket.OPEN && !ws.current) socket.close();
    };
  }, []);

  // --- 3. FETCH & ACTIONS ---
  const fetchMonitors = async () => {
    try {
      const response = await client.listMonitors({});
      setMonitors(response.monitors);
    } catch (error) {
      console.error("Fetch error:", error);
    }
  };

  useEffect(() => {
    fetchMonitors();
    const timer = window.setInterval(fetchMonitors, 10000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await client.createMonitor({ url, intervalSeconds: interval });
      await fetchMonitors();
      setUrl("");
    } catch (error) {
      alert("Error: " + error);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this monitor?")) return;
    try {
      await client.deleteMonitor({ monitorId: id });
      setMonitors((prev) => prev.filter((m) => m.id !== id));
    } catch (error) {
      alert("Error: " + error);
    }
  };

  const formatNum = (val: number | undefined) =>
    val === undefined ? 0 : Math.round(val * 100) / 100;

  return (
    <div className="h-screen w-screen bg-[#050505] text-white flex overflow-hidden font-sans selection:bg-blue-600">
      {/* LEFT PANEL */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="px-8 py-6 flex justify-between items-center z-10 border-b border-gray-900/50 bg-[#050505]/80 backdrop-blur-md sticky top-0">
          <div>
            <h1 className="text-3xl font-black tracking-tighter flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 filter drop-shadow-lg">
                PULSAR
              </span>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded border uppercase tracking-widest ${
                  wsConnected
                    ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                    : "border-red-500/30 text-red-500 bg-red-500/10"
                }`}
              >
                {wsConnected ? "Socket Connected" : "Disconnected"}
              </span>
            </h1>
          </div>
          <form
            onSubmit={handleSubmit}
            className="flex gap-3 bg-gray-900/50 p-1.5 rounded-xl border border-gray-800 shadow-inner"
          >
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="google.com"
              className="bg-transparent border-none outline-none text-sm px-3 w-64 text-gray-200 placeholder:text-gray-600"
              required
            />
            <div className="w-px h-6 bg-gray-700 my-auto"></div>
            <input
              type="number"
              value={interval}
              onChange={(e) => setIntervalVal(Number(e.target.value))}
              className="bg-transparent border-none outline-none text-sm w-12 text-center text-gray-200"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition-all shadow-lg shadow-blue-900/20 active:scale-95"
            >
              <Plus size={16} strokeWidth={3} />
            </button>
          </form>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {monitors.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-800 gap-4">
              <LayoutGrid size={80} strokeWidth={0.5} />
              <p className="text-gray-600 font-medium">
                Monitoring is empty. Add a target to start.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-6 pb-20">
              {groupedMonitors.map((m) => (
                <MonitorWidget
                  key={m.id}
                  monitor={m}
                  onDelete={handleDelete}
                  liveData={lastMonitorUpdate[m.id]}
                  allLiveData={lastMonitorUpdate}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-[340px] border-l border-gray-900 bg-[#080808] p-5 flex flex-col gap-5 h-full overflow-y-auto z-20 shadow-2xl custom-scrollbar">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            System Resources
          </h2>
          <div className="flex gap-1">
            <div
              className={`w-1 h-1 rounded-full ${
                wsConnected ? "bg-emerald-500" : "bg-red-500"
              }`}
            ></div>
            <div className="w-1 h-1 rounded-full bg-gray-700"></div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <SystemWidget
            label="CPU"
            value={formatNum(systemStats?.cpu?.percent)}
            unit="%"
            percent={systemStats?.cpu?.percent || 0}
            icon={Cpu}
            color="text-blue-400"
            borderColor="border-blue-500/20"
            bg="bg-blue-500"
            history={historyStats?.cpu}
          />
          <SystemWidget
            label="RAM"
            value={formatNum(systemStats?.memory?.used)}
            total={systemStats?.memory?.total?.toFixed(0)}
            unit="GB"
            percent={systemStats?.memory?.percent || 0}
            icon={Activity}
            color="text-purple-400"
            borderColor="border-purple-500/20"
            bg="bg-purple-500"
            // DÜZELTME: Artık hesaplanmış GB verisini veriyoruz
            history={ramHistoryInGB}
          />
          <SystemWidget
            label="Disk"
            value={formatNum(systemStats?.disk?.used)}
            total={systemStats?.disk?.total?.toFixed(0)}
            unit="GB"
            percent={systemStats?.disk?.percent || 0}
            icon={HardDrive}
            color="text-emerald-400"
            borderColor="border-emerald-500/20"
            bg="bg-emerald-500"
            history={diskHistoryInGB}
          />
          <SystemWidget
            label="Network"
            value={formatNum(systemStats?.network?.used)}
            unit="KB/s"
            percent={Math.min((systemStats?.network?.used || 0) / 10, 100)}
            icon={Wifi}
            color="text-cyan-400"
            borderColor="border-cyan-500/20"
            bg="bg-cyan-500"
            history={historyStats?.network}
          />
          <ThreadWidget
            total={systemStats?.threads?.total || 0}
            running={systemStats?.threads?.running || 0}
            sleeping={systemStats?.threads?.sleeping || 0}
            zombie={systemStats?.threads?.zombie || 0}
            isWarning={systemStats?.threads?.is_warning || false}
            history={historyStats?.threads}
          />
        </div>
        <div className="mt-auto pt-6 border-t border-gray-900/50">
          <div className="bg-gray-900/30 rounded-lg p-3 space-y-2 border border-gray-800/50">
            <div className="flex justify-between text-[10px] font-mono text-gray-500">
              <span>UPTIME</span>
              <span className="text-gray-300">
                {systemStats?.uptime
                  ? Math.floor(systemStats.uptime / 3600) + "h"
                  : "--:--"}
              </span>
            </div>
            <div className="flex justify-between text-[10px] font-mono text-gray-500">
              <span>OS</span>
              <span
                className="text-gray-300 truncate w-24 text-right"
                title={systemStats?.os}
              >
                {systemStats?.os || "Loading..."}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
