import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { client } from "../lib/client";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Activity,
  Trash2,
  Globe,
  Maximize2,
  X,
  Play,
  History,
  Clock,
  CornerDownRight,
  Plus,
} from "lucide-react";
import { TimeSlider } from "./TimeSlider";

// --- DATA TYPES ---
interface MonitorTiming {
  dns: number;
  connect: number;
  tls: number;
  ttfb: number;
  download: number;
}

interface Props {
  monitor: any;
  onDelete: (id: string) => void;
  liveData?: any;
  allLiveData?: Record<string, any>;
}

interface ChartDataPoint {
  latency: number;
  time: string;
  fullDate: string;
  timestamp: number;
  code: number;
  status: string;
  timing?: MonitorTiming;
}

// --- SETTINGS ---
const MAX_HISTORY_SIZE = 1000;
const WINDOW_SIZE = 40;

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    return (
      <div className="bg-[#09090b] border border-gray-800 p-3 rounded-lg shadow-xl z-[9999]">
        <div className="flex flex-col mb-2 border-b border-gray-800 pb-2">
          <span className="text-gray-500 text-[10px] font-medium uppercase tracking-wider">
            Timestamp
          </span>
          <span className="text-gray-300 text-xs font-mono">
            {dataPoint.fullDate} <span className="text-gray-500 mx-1">|</span>{" "}
            {dataPoint.time}
          </span>
        </div>
        <div className="flex items-end gap-1">
          <span className="font-mono font-bold text-lg leading-none text-emerald-400">
            {dataPoint.latency}
          </span>
          <span className="text-gray-500 text-xs font-mono mb-0.5">ms</span>
        </div>
        <div className="mt-2 text-[10px] text-gray-500 font-mono">
          Status: <span className="text-gray-300">{dataPoint.code}</span>
        </div>
      </div>
    );
  }
  return null;
};

// Waterfall
const WaterfallBar = ({
  timing,
  total,
}: {
  timing?: MonitorTiming;
  total: number;
}) => {
  if (!timing || total === 0) return null;
  const getPercent = (val: number) => (val / total) * 100;

  return (
    <div className="mt-6 p-4 bg-gray-900/40 rounded-xl border border-gray-800/50">
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
        <Activity size={12} /> Request Waterfall Breakdown
      </h3>
      <div className="flex h-4 w-full rounded-full overflow-hidden bg-gray-800 mb-4">
        <div
          style={{ width: `${getPercent(timing.dns)}%` }}
          className="bg-blue-500"
          title={`DNS: ${timing.dns}ms`}
        ></div>
        <div
          style={{ width: `${getPercent(timing.connect)}%` }}
          className="bg-amber-500"
          title={`Connect: ${timing.connect}ms`}
        ></div>
        <div
          style={{ width: `${getPercent(timing.tls)}%` }}
          className="bg-purple-500"
          title={`TLS: ${timing.tls}ms`}
        ></div>
        <div
          style={{ width: `${getPercent(timing.ttfb)}%` }}
          className="bg-emerald-500"
          title={`Wait: ${timing.ttfb}ms`}
        ></div>
        <div
          style={{ width: `${getPercent(timing.download)}%` }}
          className="bg-gray-400"
          title={`DL: ${timing.download}ms`}
        ></div>
      </div>
      <div className="grid grid-cols-5 gap-2 text-[10px]">
        <div className="flex flex-col gap-1">
          <span className="text-gray-400">DNS</span>
          <span className="font-bold text-gray-200">
            {timing.dns.toFixed(0)}ms
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-gray-400">TCP</span>
          <span className="font-bold text-gray-200">
            {timing.connect.toFixed(0)}ms
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-gray-400">TLS</span>
          <span className="font-bold text-gray-200">
            {timing.tls.toFixed(0)}ms
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-gray-400">TTFB</span>
          <span className="font-bold text-gray-200">
            {timing.ttfb.toFixed(0)}ms
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-gray-400">DL</span>
          <span className="font-bold text-gray-200">
            {timing.download.toFixed(0)}ms
          </span>
        </div>
      </div>
    </div>
  );
};

export function MonitorWidget({
  monitor,
  onDelete,
  liveData,
  allLiveData,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState<ChartDataPoint[]>([]);

  const [isLive, setIsLive] = useState(true);
  const [sliderValue, setSliderValue] = useState(0);
  const [hoveredData, setHoveredData] = useState<ChartDataPoint | null>(null);

  // Add Sub-Page States
  const [showAddSub, setShowAddSub] = useState(false);
  const [subPath, setSubPath] = useState("");
  const [subLoading, setSubLoading] = useState(false);

  const cleanUrl = monitor.url
    .replace("https://", "")
    .replace("http://", "")
    .replace("www.", "");

  useEffect(() => {
    setMounted(true);
  }, []);

  // --- 1. LOAD INITIAL HISTORY DATA ---
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const resp = await client.getMonitorStats({ monitorId: monitor.id });
        const historicalData: ChartDataPoint[] = resp.stats.map((s) => {
          const date = new Date(s.time);
          return {
            latency: s.latency,
            code: s.code,
            status: s.status || (s.code >= 200 && s.code < 300 ? "OK" : "DOWN"),
            timestamp: date.getTime(),
            time: date.toLocaleTimeString("tr-TR", { hour12: false }),
            fullDate: date.toLocaleDateString("tr-TR"),
            timing: s.timing
              ? {
                  dns: s.timing.dns,
                  connect: s.timing.tcp,
                  tls: s.timing.tls,
                  ttfb: s.timing.ttfb,
                  download: s.timing.download,
                }
              : undefined,
          };
        });
        setHistory(historicalData.reverse());
      } catch (e) {
        console.error("Geçmiş yüklenemedi:", e);
      }
    };
    if (monitor.id) loadHistory();
  }, [monitor.id]);

  // --- 2. ADD NEW DATA POINT EVERY INTERVAL ---
  useEffect(() => {
    if (!liveData) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString("tr-TR", { hour12: false });
    const dateStr = now.toLocaleDateString("tr-TR");
    setHistory((prev) => {
      const newData = [
        ...prev,
        {
          latency: liveData.latency,
          status: liveData.status,
          code: liveData.code,
          time: timeStr,
          fullDate: dateStr,
          timestamp: now.getTime(),
          timing: liveData.timing,
        },
      ];
      if (newData.length > MAX_HISTORY_SIZE)
        return newData.slice(newData.length - MAX_HISTORY_SIZE);
      return newData;
    });
  }, [liveData]);

  // --- AUTO SCROLL ---
  useEffect(() => {
    if (history.length > 0 && isLive) {
      setSliderValue(Math.max(0, history.length - WINDOW_SIZE));
    }
  }, [history.length, isLive]);

  const modalVisibleData = history.slice(
    sliderValue,
    sliderValue + WINDOW_SIZE
  );
  const sparklineData = history.slice(-WINDOW_SIZE);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = Number(e.target.value);
    setSliderValue(newVal);
    const maxVal = Math.max(0, history.length - WINDOW_SIZE);
    if (newVal >= maxVal - 1) setIsLive(true);
    else setIsLive(false);
  };

  const activeDisplayData =
    hoveredData || (history.length > 0 ? history[sliderValue] : null);
  const currentLatency = activeDisplayData?.latency || 0;
  const currentStatus = activeDisplayData?.status || "WAITING";
  const currentCode = activeDisplayData?.code || 0;
  const statusColor =
    currentLatency > 500
      ? "text-red-400"
      : currentLatency > 200
      ? "text-amber-400"
      : "text-emerald-400";
  const strokeColor =
    currentLatency > 500
      ? "#f87171"
      : currentLatency > 200
      ? "#fbbf24"
      : "#34d399";

  const lastDataPoint = history.length > 0 ? history[history.length - 1] : null;
  const getLastLatency = lastDataPoint?.latency || 0;
  const lastStatusColor =
    getLastLatency > 500
      ? "text-red-400"
      : getLastLatency > 200
      ? "text-amber-400"
      : "text-emerald-400";
  const lastStatusBg =
    getLastLatency > 500
      ? "bg-red-500"
      : getLastLatency > 200
      ? "bg-amber-500"
      : "bg-emerald-500";
  const lastStrokeColor =
    getLastLatency > 500
      ? "#f87171"
      : getLastLatency > 200
      ? "#fbbf24"
      : "#34d399";

  // --- ADD SUB-PAGE ---
  const handleAddSubPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subPath) return;
    let cleanPath = subPath.trim();
    if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;
    const fullUrl = monitor.url + cleanPath;

    setSubLoading(true);
    try {
      await client.createMonitor({
        url: fullUrl,
        intervalSeconds: monitor.intervalSeconds,
      });
      setSubPath("");
      setShowAddSub(false);
    } catch (err) {
      alert("Ekleme hatası: " + err);
    }
    setSubLoading(false);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="bg-[#09090b] border border-gray-800 w-full max-w-5xl h-[800px] rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-5">
            <div
              className={`p-4 rounded-2xl bg-gray-900/50 border border-gray-800 ${statusColor}`}
            >
              <Globe size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight mb-1 flex items-center gap-2">
                {cleanUrl}
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-400 uppercase tracking-widest border border-gray-700">
                  {hoveredData ? hoveredData.time : currentStatus}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-500 font-mono border border-gray-700">
                  CODE: {currentCode}
                </span>
              </h2>
              <div className="flex items-baseline gap-2">
                <span className={`text-4xl font-mono font-bold ${statusColor}`}>
                  {currentLatency}
                </span>
                <span className="text-lg font-mono text-gray-500">ms</span>
                {!isLive ? (
                  <span className="ml-4 flex items-center gap-1.5 text-[10px] font-bold text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20 uppercase tracking-widest animate-pulse">
                    <History size={12} /> History Mode
                  </span>
                ) : (
                  <span className="ml-4 flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20 uppercase tracking-widest">
                    <Play size={12} fill="currentColor" /> Live
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-full hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 w-full bg-gray-900/20 rounded-2xl border border-gray-800/50 p-6 relative overflow-hidden flex flex-col justify-between">
          {/* CHART */}
          <div className="flex-1 min-h-0 mb-4 relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={modalVisibleData}
                onMouseMove={(e) => {
                  if (e.activePayload && e.activePayload.length > 0) {
                    setHoveredData(
                      e.activePayload[0].payload as ChartDataPoint
                    );
                  }
                }}
                onMouseLeave={() => {
                  setHoveredData(null);
                }}
              >
                <defs>
                  <linearGradient
                    id={`grad-modal-${monitor.id}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={strokeColor}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor={strokeColor}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#222"
                  vertical={false}
                  opacity={0.5}
                />
                <XAxis dataKey="time" hide />
                <YAxis
                  stroke="#555"
                  fontSize={12}
                  tickFormatter={(val) => `${val}ms`}
                  domain={[0, "auto"]}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{ stroke: "#444", strokeWidth: 1 }}
                />
                <Area
                  type="monotone"
                  dataKey="latency"
                  stroke={strokeColor}
                  strokeWidth={3}
                  fill={`url(#grad-modal-${monitor.id})`}
                  animationDuration={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {activeDisplayData && activeDisplayData.timing && (
            <div className="mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <WaterfallBar
                timing={activeDisplayData.timing}
                total={activeDisplayData.latency}
              />
            </div>
          )}

          {/* --- YENİ SLIDER BİLEŞENİ --- */}
          <TimeSlider
            totalItems={history.length}
            windowSize={WINDOW_SIZE}
            sliderValue={sliderValue}
            onSliderChange={handleSliderChange}
            isLive={isLive}
            currentViewDate={history[sliderValue]?.fullDate || ""}
            currentViewTime={history[sliderValue]?.time || "--:--"}
            getTimeAtIndex={(index) => history[index]?.time || ""}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="group relative bg-[#09090b] border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-900/5 flex flex-col h-auto min-h-[250px]">
        {/* HEADER & SPARKLINE */}
        <div className="flex justify-between items-start mb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl bg-gray-900 border border-gray-800 ${lastStatusColor} group-hover:scale-110 transition-transform duration-300`}
            >
              <Activity size={18} />
            </div>
            <div className="overflow-hidden">
              <h3
                className="font-bold text-gray-200 text-sm truncate w-40 tracking-tight"
                title={monitor.url}
              >
                {cleanUrl}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider border border-gray-800 px-1.5 rounded">
                  {monitor.intervalSeconds}s Interval
                </span>
                <span className="text-[10px] text-gray-600 flex items-center gap-1">
                  <Clock size={10} /> Live
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setIsOpen(true)}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <Maximize2 size={16} />
            </button>
            <button
              onClick={() => onDelete(monitor.id)}
              className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div
          className="h-24 w-full bg-gray-900/30 rounded-xl border border-gray-800/50 relative overflow-hidden cursor-pointer mb-4"
          onClick={() => setIsOpen(true)}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient
                  id={`grad-${monitor.id}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={lastStrokeColor}
                    stopOpacity={0.5}
                  />
                  <stop
                    offset="95%"
                    stopColor={lastStrokeColor}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, "auto"]} />
              <Area
                type="monotone"
                dataKey="latency"
                stroke={lastStrokeColor}
                strokeWidth={2}
                fill={`url(#grad-${monitor.id})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex justify-between items-center relative z-10 mb-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full animate-pulse ${lastStatusBg}`}
            ></div>
            <span className={`text-sm font-mono font-bold ${lastStatusColor}`}>
              {getLastLatency} ms
            </span>
          </div>
          <span className="text-[10px] text-gray-600 font-mono">
            Code: {liveData?.code || 0}
          </span>
        </div>

        {/* --- SUB-PAGES SECTION --- */}
        <div className="border-t border-gray-800/50 bg-black/20 -mx-5 -mb-5 p-4 rounded-b-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-gray-500">
              <CornerDownRight size={14} />
              <span className="text-[10px] font-bold uppercase tracking-widest">
                Sub-Pages
              </span>
            </div>
            <button
              onClick={() => setShowAddSub(!showAddSub)}
              className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus size={12} /> Add Page
            </button>
          </div>

          {showAddSub && (
            <form
              onSubmit={handleAddSubPage}
              className="flex gap-2 mb-3 animate-in slide-in-from-top-2"
            >
              <div className="flex-1 flex items-center bg-gray-900/50 border border-gray-700 rounded-md px-2">
                <span className="text-gray-500 text-xs font-mono truncate max-w-[100px]">
                  {monitor.url}
                </span>
                <input
                  autoFocus
                  type="text"
                  value={subPath}
                  onChange={(e) => setSubPath(e.target.value)}
                  placeholder="/pricing"
                  className="bg-transparent border-none outline-none text-xs text-white p-1.5 w-full font-mono"
                />
              </div>
              <button
                disabled={subLoading}
                className="bg-blue-600 text-white px-3 rounded-md text-xs font-bold hover:bg-blue-500"
              >
                {subLoading ? "..." : "ADD"}
              </button>
            </form>
          )}

          <div className="flex flex-col gap-2">
            {monitor.children && monitor.children.length > 0 ? (
              monitor.children.map((child: any) => {
                const childData = allLiveData ? allLiveData[child.id] : null;
                const isUp = childData
                  ? childData.code >= 200 && childData.code < 300
                  : true;
                const latency = childData ? childData.latency : 0;
                return (
                  <div
                    key={child.id}
                    className="group flex items-center justify-between bg-gray-900/40 border border-gray-800/50 rounded-lg p-2 hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isUp
                            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                            : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                        }`}
                      ></div>
                      <span
                        className="text-xs font-mono text-gray-300 truncate"
                        title={child.url}
                      >
                        /{child.url.replace(monitor.url, "").replace(/^\//, "")}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <Activity size={10} className="text-gray-600" />
                        <span
                          className={`text-xs font-mono font-bold ${
                            latency > 500 ? "text-amber-500" : "text-gray-400"
                          }`}
                        >
                          {latency}ms
                        </span>
                      </div>
                      <button
                        onClick={() => onDelete(child.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-all text-gray-600"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-[10px] text-gray-700 italic text-center py-2">
                No sub-pages monitored.
              </div>
            )}
          </div>
        </div>
      </div>
      {mounted && isOpen && createPortal(modalContent, document.body)}
    </>
  );
}
