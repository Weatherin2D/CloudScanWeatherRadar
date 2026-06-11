import { Play, Pause, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { formatModelHour } from "@/lib/ecmwfModels";

interface Props {
  times: string[];
  hourIndex: number;
  playing: boolean;
  loading?: boolean;
  onHourChange: (index: number) => void;
  onPlayingChange: (playing: boolean) => void;
  opacity: number;
  onOpacityChange: (v: number) => void;
}

export default function ModelTimeline({
  times,
  hourIndex,
  playing,
  loading,
  onHourChange,
  onPlayingChange,
  opacity,
  onOpacityChange,
}: Props) {
  const current = times[hourIndex];

  const step = (delta: number) => {
    onPlayingChange(false);
    onHourChange(Math.max(0, Math.min(times.length - 1, hourIndex + delta)));
  };

  return (
    <div className="relative flex-shrink-0 bg-gray-900/95 border-t border-gray-800 px-3 sm:px-4 py-2 sm:py-2.5 z-[1000]">
      <div className="max-w-6xl mx-auto">
        {current && (
          <div className="flex items-center gap-2 mb-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <span className="text-sm font-medium">{formatModelHour(current)}</span>
            <span className="px-1.5 py-0.5 rounded text-xs bg-orange-900/50 text-orange-300 border border-orange-700/50">
              ECMWF · +{hourIndex}h
            </span>
            {loading && <span className="text-xs text-gray-500">Updating…</span>}
          </div>
        )}

        {times.length > 0 && (
          <div className="flex gap-px mb-2 h-4 sm:h-2 overflow-x-auto">
            {times.map((t, i) => (
              <button
                key={t}
                onClick={() => {
                  onPlayingChange(false);
                  onHourChange(i);
                }}
                className={`flex-1 min-w-[3px] rounded transition-all h-full ${
                  i === hourIndex ? "bg-orange-500 sm:scale-y-150" : "bg-gray-700 hover:bg-gray-500"
                }`}
                title={formatModelHour(t)}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => step(-1)}
            disabled={hourIndex === 0}
            className="p-2 sm:p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors text-gray-300"
          >
            <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={() => onPlayingChange(!playing)}
            className="flex items-center gap-2 px-4 py-2 sm:py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium transition-colors"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {playing ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => step(1)}
            disabled={hourIndex >= times.length - 1}
            className="p-2 sm:p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors text-gray-300"
          >
            <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4" />
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-orange-400/80 font-semibold hidden sm:block">
              ECMWF IFS
            </span>
            <span className="text-xs text-gray-500 hidden sm:block">Opacity</span>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => onOpacityChange(Number(e.target.value))}
              className="w-20 sm:w-24 h-1.5 accent-orange-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
