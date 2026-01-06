import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  type LucideIcon,
  X,
  Maximize2,
  Play,
  History,
  Bell,
  AlertTriangle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { TimeSlider } from "./TimeSlider";

interface Props {
  label: string;
  value: number;
  total?: string | number;
  unit: string;
  percent: number;
  icon: LucideIcon;
  color: string;
  borderColor: string;
  bg: string;
  history?: number[];
}

interface ChartDataPoint {
  value: number;
  time: string;
  fullDate: string;
}

const MAX_HISTORY_SIZE = 100;
const WINDOW_SIZE = 50;
const DATA_INTERVAL_MS = 15000;

const CustomTooltip = ({ active, payload, unit }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload;
    return (
      <div className="bg-[#09090b] border border-gray-800 p-3 rounded-lg shadow-xl z-50">
        <div className="flex flex-col mb-2 border-b border-gray-800 pb-2">
          <span className="text-gray-500 text-[10px] font-medium uppercase tracking-wider">
            Time
          </span>
          <span className="text-gray-300 text-xs font-mono">
            {dataPoint.fullDate} <span className="text-gray-500 mx-1">|</span>{" "}
            {dataPoint.time}
          </span>
        </div>
        <div className="flex items-end gap-1">
          <span className="text-white font-mono font-bold text-lg leading-none">
            {Number(payload[0].value).toFixed(2)}
          </span>
          <span className="text-gray-500 text-xs font-mono mb-0.5">{unit}</span>
        </div>
      </div>
    );
  }
  return null;
};

export function SystemWidget({
  label,
  value,
  total,
  unit,
  percent,
  icon: Icon,
  color,
  borderColor,
  bg,
  history,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [sliderValue, setSliderValue] = useState(0);
  const [threshold, setThreshold] = useState<number>(0);
  const [isBreached, setIsBreached] = useState(false);

  const historyLoaded = useRef(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(`pulsar_threshold_${label}`);
    if (saved) {
      setThreshold(Number(saved));
    }
  }, [label]);

  // --- 1. HISTORY LOAD ---
  // --- 1. HISTORY LOAD ---
  useEffect(() => {
    if (history && history.length > 0 && !historyLoaded.current) {
      const now = new Date();

      // --- DÜZELTME BURADA ---
      // Backend'den veri [YENİ -> ESKİ] geliyor.
      // Bizim zaman hesaplamamız ise [ESKİ -> YENİ] mantığına göre.
      // Bu yüzden diziyi önce ters çeviriyoruz (reverse).
      // [...history] diyerek kopyasını alıyoruz ki orijinal array bozulmasın.
      const reversedHistory = [...history].reverse();

      const formattedHistory: ChartDataPoint[] = reversedHistory.map(
        (val, index) => {
          // Artık index 0 = En Eski Veri
          // Index Son = En Yeni Veri
          // timeOffset mantığımız şimdi doğru çalışacak:
          // (Length - 1 - index) -> index arttıkça offset azalır (günüme yaklaşır)
          const timeOffset =
            (reversedHistory.length - 1 - index) * DATA_INTERVAL_MS;
          const pointDate = new Date(now.getTime() - timeOffset);

          return {
            value: val,
            time: pointDate.toLocaleTimeString("tr-TR", { hour12: false }),
            fullDate: pointDate.toLocaleDateString("tr-TR"),
          };
        }
      );

      setData((prev) => {
        // Live data gelmiş olabilir, onları koruyarak geçmişi başa ekle
        // Çakışma olmaması için timestamp kontrolü yapılabilir ama
        // şimdilik basit merge yeterli.
        const merged = [...formattedHistory, ...prev];

        // Max boyutu aşarsa kırp
        if (merged.length > MAX_HISTORY_SIZE) {
          return merged.slice(merged.length - MAX_HISTORY_SIZE);
        }
        return merged;
      });
      historyLoaded.current = true;
    }
  }, [history]);

  // --- 2. LIVE DATA ---
  useEffect(() => {
    if (value === undefined || value === null) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString("tr-TR", { hour12: false });
    const dateStr = now.toLocaleDateString("tr-TR");

    setData((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].time === timeStr) {
        return prev;
      }
      const newData = [
        ...prev,
        { value: value, time: timeStr, fullDate: dateStr },
      ];
      if (newData.length > MAX_HISTORY_SIZE) {
        return newData.slice(newData.length - MAX_HISTORY_SIZE);
      }
      return newData;
    });
  }, [value]);

  // Threshold Check
  useEffect(() => {
    if (threshold > 0) {
      setIsBreached(value > threshold);
    } else {
      setIsBreached(false);
    }
  }, [value, threshold]);

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setThreshold(val);
    localStorage.setItem(`pulsar_threshold_${label}`, val.toString());
  };

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

  const yDomain = unit === "%" ? [0, 100] : [0, "auto"];

  const currentBorderColor = isBreached
    ? "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse"
    : borderColor;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={() => setIsOpen(false)}
    >
      <div
        className={`bg-[#09090b] border w-full max-w-5xl h-[700px] rounded-3xl p-8 relative shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col transition-colors ${
          isBreached ? "border-red-900/50" : "border-gray-800"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-5">
            <div
              className={`p-4 rounded-2xl bg-gray-900/50 border border-gray-800 ${
                isBreached ? "text-red-500 animate-bounce" : color
              }`}
            >
              {isBreached ? <AlertTriangle size={32} /> : <Icon size={32} />}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight mb-1 flex items-center gap-3">
                {label} Details
              </h2>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-4xl font-mono font-bold ${
                    isBreached ? "text-red-500" : "text-gray-100"
                  }`}
                >
                  {value}
                </span>
                <span className="text-lg font-mono text-gray-500">{unit}</span>
                {total && (
                  <span className="text-sm text-gray-600 font-mono ml-2">
                    / {total} {unit}
                  </span>
                )}
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
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2 bg-gray-900/50 p-2 rounded-lg border border-gray-800">
              <Bell size={16} className="text-gray-500" />
              <div className="flex flex-col">
                <label className="text-[9px] text-gray-500 font-bold uppercase">
                  Alert Limit
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={threshold}
                    onChange={handleThresholdChange}
                    className="bg-transparent text-white font-mono text-sm w-16 outline-none"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-gray-600">{unit}</span>
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
        </div>

        <div className="flex-1 w-full bg-gray-900/20 rounded-2xl border border-gray-800/50 p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="flex-1 min-h-0 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={visibleData}>
                <defs>
                  <linearGradient
                    id={`grad-modal-${label}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={isBreached ? "#ef4444" : "currentColor"}
                      className={isBreached ? "text-red-500" : color}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="95%"
                      stopColor={isBreached ? "#ef4444" : "currentColor"}
                      className={isBreached ? "text-red-500" : color}
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
                  tickFormatter={(val) => `${val}`}
                  domain={yDomain as any}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  content={<CustomTooltip unit={unit} />}
                  cursor={{ stroke: "#444", strokeWidth: 1 }}
                />
                {threshold > 0 && (
                  <ReferenceLine
                    y={threshold}
                    stroke="#ef4444"
                    strokeDasharray="5 5"
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isBreached ? "#ef4444" : "currentColor"}
                  className={isBreached ? "text-red-500" : color}
                  strokeWidth={3}
                  fill={`url(#grad-modal-${label})`}
                  animationDuration={300}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* --- NEW  SLIDER COMPONENT --- */}
          <TimeSlider
            totalItems={data.length}
            windowSize={WINDOW_SIZE}
            sliderValue={sliderValue}
            onSliderChange={handleSliderChange}
            isLive={isLive}
            currentViewDate={data[sliderValue]?.fullDate || ""}
            currentViewTime={data[sliderValue]?.time || "--:--"}
            getTimeAtIndex={(index) => data[index]?.time || ""}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className={`bg-gray-900/40 border rounded-2xl flex flex-col justify-between p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:bg-gray-900/60 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] select-none h-40 ${currentBorderColor}`}
      >
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <Maximize2 size={14} className="text-gray-400" />
        </div>
        {isBreached && (
          <div className="absolute top-3 right-8 z-20 animate-bounce">
            <AlertTriangle size={14} className="text-red-500" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 opacity-10 pointer-events-none z-0 group-hover:opacity-25 transition-opacity duration-500">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient
                  id={`grad-${label}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={isBreached ? "#ef4444" : "currentColor"}
                    className={isBreached ? "text-red-500" : color}
                    stopOpacity={0.6}
                  />
                  <stop
                    offset="95%"
                    stopColor={isBreached ? "#ef4444" : "currentColor"}
                    className={isBreached ? "text-red-500" : color}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <YAxis hide domain={yDomain as any} />
              {threshold > 0 && (
                <ReferenceLine
                  y={threshold}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={isBreached ? "#ef4444" : "currentColor"}
                className={isBreached ? "text-red-500" : color}
                strokeWidth={2}
                fill={`url(#grad-${label})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="relative z-10 h-full flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div
              className={`p-2 rounded-lg bg-gray-950/50 border border-gray-800 ${
                isBreached ? "text-red-500" : color
              }`}
            >
              {isBreached ? <AlertTriangle size={20} /> : <Icon size={20} />}
            </div>
            <span className="text-[11px] text-gray-500 font-bold uppercase tracking-widest">
              {label}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-3xl font-bold font-mono tracking-tighter ${
                  isBreached ? "text-red-500 animate-pulse" : "text-white"
                }`}
              >
                {value}
              </span>
              {unit && (
                <span className="text-xs text-gray-500 font-mono font-medium">
                  {unit}
                </span>
              )}
            </div>
            <div className="h-1.5 w-full bg-gray-800/50 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-700 ease-out ${
                  isBreached ? "bg-red-500" : bg
                }`}
                style={{ width: `${Math.min(percent, 100)}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>
      {mounted && isOpen && createPortal(modalContent, document.body)}
    </>
  );
}
