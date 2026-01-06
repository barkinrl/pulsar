import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Layers,
  AlertTriangle,
  Maximize2,
  X,
  Play,
  History,
  Calendar,
} from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

interface ThreadDataPoint {
  time: string;
  fullDate: string;
  running: number;
  sleeping: number;
  zombie: number;
}

interface Props {
  total: number;
  running: number;
  sleeping: number;
  zombie: number;
  isWarning: boolean;
  history?: {
    running: number;
    sleeping: number;
    zombie: number;
    time: string;
  }[];
}

const MAX_HISTORY_SIZE = 1000;
const WINDOW_SIZE = 50;
const DATA_INTERVAL_MS = 15000;

// Special Tooltip
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#09090b] border border-gray-800 p-3 rounded-lg shadow-xl text-xs font-mono z-50">
        <div className="mb-2 text-gray-500 border-b border-gray-800 pb-1 flex justify-between gap-4">
          <span>{data.fullDate}</span>
          <span>{data.time}</span>
        </div>
        <div className="flex items-center gap-2 text-red-400">
          <div className="w-2 h-2 rounded-full bg-red-500"></div>
          Zombie: {data.zombie}
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <div className="w-2 h-2 rounded-full bg-gray-500"></div>
          Sleeping: {data.sleeping}
        </div>
        <div className="flex items-center gap-2 text-blue-400">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          Running: {data.running}
        </div>
        <div className="mt-2 pt-1 border-t border-gray-800 font-bold text-white">
          Total: {data.running + data.sleeping + data.zombie}
        </div>
      </div>
    );
  }
  return null;
};

export function ThreadWidget({
  total,
  running,
  sleeping,
  zombie,
  isWarning,
  history,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<ThreadDataPoint[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [sliderValue, setSliderValue] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 1. LOAD INITIAL HISTORY DATA
  useEffect(() => {
    if (history && history.length > 0) {
      setData((prev) => {
        if (prev.length >= history.length + 5) return prev;

        const now = new Date();
        const formattedHistory: ThreadDataPoint[] = history.map(
          (val, index) => {
            const timeOffset = (history.length - 1 - index) * DATA_INTERVAL_MS;
            const pointDate = new Date(now.getTime() - timeOffset);
            return {
              time: pointDate.toLocaleTimeString("tr-TR", { hour12: false }),
              fullDate: pointDate.toLocaleDateString("tr-TR"),
              running: val.running,
              sleeping: val.sleeping,
              zombie: val.zombie,
            };
          }
        );
        return [...formattedHistory, ...prev];
      });
    }
  }, [history]);

  // 2. ADD NEW DATA POINT EVERY INTERVAL
  useEffect(() => {
    if (total === 0 && running === 0) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString("tr-TR", { hour12: false });
    const dateStr = now.toLocaleDateString("tr-TR");

    setData((prev) => {
      const newData = [
        ...prev,
        { time: timeStr, fullDate: dateStr, running, sleeping, zombie },
      ];
      if (newData.length > MAX_HISTORY_SIZE)
        return newData.slice(-MAX_HISTORY_SIZE);
      return newData;
    });
  }, [total, running, sleeping, zombie]);

  // Auto Scroll
  useEffect(() => {
    if (data.length > 0 && isLive) {
      setSliderValue(Math.max(0, data.length - WINDOW_SIZE));
    }
  }, [data.length, isLive]);

  const visibleData = data.slice(sliderValue, sliderValue + WINDOW_SIZE);
  const sparklineData = data.slice(-40);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = Number(e.target.value);
    setSliderValue(newVal);
    const maxVal = Math.max(0, data.length - WINDOW_SIZE);
    if (newVal >= maxVal - 1) setIsLive(true);
    else setIsLive(false);
  };

  const currentViewTime = data[sliderValue]?.time || "--:--";
  const currentViewDate = data[sliderValue]?.fullDate || "";

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={() => setIsOpen(false)}
    >
      <div
        className={`bg-[#09090b] border w-full max-w-5xl h-[700px] rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col transition-colors ${
          isWarning ? "border-red-900/50" : "border-gray-800"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-5">
            <div
              className={`p-4 rounded-2xl bg-gray-900/50 border border-gray-800 ${
                isWarning ? "text-red-500 animate-bounce" : "text-amber-500"
              }`}
            >
              <Layers size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight mb-1 flex items-center gap-3">
                Thread Processes
              </h2>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-4xl font-mono font-bold ${
                    isWarning ? "text-red-500" : "text-white"
                  }`}
                >
                  {total}
                </span>
                <span className="text-lg font-mono text-gray-500">Total</span>

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

        {/* MODAL CHART */}
        <div className="flex-1 w-full bg-gray-900/20 rounded-2xl border border-gray-800/50 p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="flex-1 min-h-0 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={visibleData}>
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
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Stacked Areas */}
                <Area
                  type="monotone"
                  dataKey="zombie"
                  stackId="1"
                  stroke="#ef4444"
                  fill="#ef4444"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="sleeping"
                  stackId="1"
                  stroke="#6b7280"
                  fill="#6b7280"
                  strokeWidth={0}
                />
                <Area
                  type="monotone"
                  dataKey="running"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  strokeWidth={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* SLIDER */}
          <div className="mt-2 px-2 select-none pt-6 relative w-full h-12 flex items-center group">
            <div
              className="absolute top-0 transition-all duration-75 ease-out z-20 flex flex-col items-center"
              style={{
                left: `${
                  (sliderValue / Math.max(1, data.length - WINDOW_SIZE)) * 100
                }%`,
                transform: "translateX(-50%)",
              }}
            >
              <div
                className={`flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-mono font-bold shadow-lg border mb-1 whitespace-nowrap ${
                  isLive
                    ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                    : "bg-amber-950 border-amber-800 text-amber-400"
                }`}
              >
                <Calendar size={10} />
                <span>{currentViewDate}</span>
                <span className="opacity-50">|</span>
                <span>{currentViewTime}</span>
              </div>
              <div
                className={`w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] ${
                  isLive ? "border-t-emerald-800" : "border-t-amber-800"
                }`}
              ></div>
            </div>
            <div className="absolute w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-75 ${
                  isLive ? "bg-emerald-500/50" : "bg-amber-500/50"
                }`}
                style={{
                  width: `${
                    (sliderValue / Math.max(1, data.length - WINDOW_SIZE)) * 100
                  }%`,
                }}
              ></div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, data.length - WINDOW_SIZE)}
              value={sliderValue}
              onChange={handleSliderChange}
              className="absolute w-full h-full opacity-0 cursor-pointer z-10 top-2"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className={`bg-gray-900/40 border rounded-2xl p-4 shadow-lg backdrop-blur-sm h-40 flex flex-col justify-between relative overflow-hidden cursor-pointer hover:bg-gray-900/60 transition-all hover:scale-[1.02] active:scale-[0.98] select-none ${
          isWarning ? "border-red-500/50 shadow-red-900/20" : "border-gray-800"
        }`}
      >
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <Maximize2 size={14} className="text-gray-400" />
        </div>

        {/* HEADER */}
        <div className="flex justify-between items-start z-10">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg bg-gray-950/50 border border-gray-800 ${
                isWarning ? "text-red-500" : "text-amber-500"
              }`}
            >
              <Layers size={20} />
            </div>
            <div>
              <h3 className="text-[11px] text-gray-500 font-bold uppercase tracking-widest">
                PROCESSES
              </h3>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white font-mono">
                  {total}
                </span>
                {isWarning && (
                  <AlertTriangle
                    size={14}
                    className="text-red-500 animate-bounce"
                  />
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end text-[10px] font-mono gap-0.5 opacity-70">
            <span className="text-blue-400">RUN: {running}</span>
            <span className="text-gray-400">SLP: {sleeping}</span>
            <span className="text-red-400">ZMB: {zombie}</span>
          </div>
        </div>

        {/* SMALL STACKED GRAPH AREA */}
        <div className="absolute inset-x-0 bottom-0 h-24 opacity-30 z-0 pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <Area
                type="monotone"
                dataKey="zombie"
                stackId="1"
                stroke="#ef4444"
                fill="#ef4444"
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="sleeping"
                stackId="1"
                stroke="#6b7280"
                fill="#6b7280"
                strokeWidth={0}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="running"
                stackId="1"
                stroke="#3b82f6"
                fill="#3b82f6"
                strokeWidth={0}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      {mounted && isOpen && createPortal(modalContent, document.body)}
    </>
  );
}
