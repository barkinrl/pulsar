import React from "react";
import { Calendar } from "lucide-react";

interface Props {
  totalItems: number;
  windowSize: number;
  sliderValue: number;
  onSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isLive: boolean;
  currentViewDate: string;
  currentViewTime: string;
  getTimeAtIndex: (index: number) => string;
}

export function TimeSlider({
  totalItems,
  windowSize,
  sliderValue,
  onSliderChange,
  isLive,
  currentViewDate,
  currentViewTime,
  getTimeAtIndex,
}: Props) {
  const maxVal = Math.max(0, totalItems - windowSize);
  const percent = maxVal > 0 ? (sliderValue / maxVal) * 100 : 0;

  const colorClass = isLive
    ? "text-emerald-400 border-emerald-500 bg-emerald-950/80"
    : "text-amber-400 border-amber-500 bg-amber-950/80";
  const bgTrack = isLive ? "bg-emerald-500/50" : "bg-amber-500/50";
  const thumbBorder = isLive ? "border-emerald-500" : "border-amber-500";
  const thumbDot = isLive ? "bg-emerald-500" : "bg-amber-500";
  const arrowBorder = isLive ? "border-t-emerald-500" : "border-t-amber-500";

  return (
    <div className="mt-2 px-2 select-none pt-8 relative w-full h-12 flex items-center group touch-none z-10">
      {/* 1. History sheet */}
      <div
        className="absolute -top-6 transition-all duration-75 ease-out z-30 flex flex-col items-center pointer-events-none"
        style={{ left: `${percent}%`, transform: "translateX(-50%)" }}
      >
        <div
          className={`flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-mono font-bold shadow-xl border mb-1 whitespace-nowrap backdrop-blur-md ${colorClass}`}
        >
          <Calendar size={10} />
          <span>{currentViewDate}</span>
          <span className="opacity-50">|</span>
          <span>{currentViewTime}</span>
        </div>
        {/* Arrow */}
        <div
          className={`w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] ${arrowBorder}`}
        ></div>
      </div>

      {/* 2. Track */}
      <div className="absolute w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-75 ${bgTrack}`}
          style={{ width: `${percent}%` }}
        ></div>
      </div>

      {/* 3. INVISIBLE INPUT */}
      <input
        type="range"
        min={0}
        max={maxVal}
        value={sliderValue}
        onChange={onSliderChange}
        className="absolute w-full h-10 opacity-0 cursor-pointer z-40 top-1/2 -translate-y-1/2"
      />

      {/* 4. THUMB ) */}
      <div
        className={`absolute top-1/2 h-5 w-5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)] border-2 pointer-events-none transition-all duration-75 ease-out z-20 flex items-center justify-center ${thumbBorder}`}
        style={{
          left: `${percent}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className={`w-1.5 h-1.5 rounded-full ${thumbDot}`}></div>
      </div>

      {/* 5. Ruler */}
      <div className="absolute -bottom-6 w-full flex justify-between px-0.5 pointer-events-none">
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const index = Math.floor(maxVal * pct);
          return (
            <div key={i} className="flex flex-col items-center">
              <div className="w-px h-2 bg-gray-800 mb-1"></div>
              <span className="text-[9px] font-mono text-gray-600">
                {getTimeAtIndex(index)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
