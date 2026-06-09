import { useState, useRef, useCallback } from "react";
import { Trash2, Download, Upload, Plus } from "lucide-react";
import {
  type ColorStop,
  stopsToCss,
  serializePal,
  parsePal,
  fromWindyJson,
  dbzToBarPercent,
  barPercentToDbz,
  PAL_DBZ_MIN,
  PAL_DBZ_MAX,
  PAL_DBZ_STEP,
} from "@/lib/palPalette";

interface Props {
  stops: ColorStop[];
  onChange: (stops: ColorStop[]) => void;
}

export default function ColorScaleEditor({ stops, onChange }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  const sorted = [...stops].sort((a, b) => a.dbz - b.dbz);
  const gradient = stopsToCss(sorted);

  const tickMarks: number[] = [];
  for (let d = PAL_DBZ_MIN; d <= PAL_DBZ_MAX; d += PAL_DBZ_STEP) {
    tickMarks.push(d);
  }

  const interpolateAtDbz = useCallback(
    (dbz: number): ColorStop => {
      let lo = sorted[0];
      let hi = sorted[sorted.length - 1];
      for (let j = 0; j < sorted.length - 1; j++) {
        if (dbz >= sorted[j].dbz && dbz <= sorted[j + 1].dbz) {
          lo = sorted[j];
          hi = sorted[j + 1];
          break;
        }
      }
      if (dbz <= sorted[0].dbz) return { ...sorted[0], dbz };
      if (dbz >= sorted[sorted.length - 1].dbz) return { ...sorted[sorted.length - 1], dbz };

      const span = hi.dbz - lo.dbz;
      const t = span === 0 ? 1 : (dbz - lo.dbz) / span;
      const parse = (hex: string) => {
        const h = hex.replace("#", "");
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      };
      const [loR, loG, loB] = parse(lo.color);
      const [hiR, hiG, hiB] = parse(hi.color);
      const r = Math.round(loR + t * (hiR - loR));
      const g = Math.round(loG + t * (hiG - loG));
      const b = Math.round(loB + t * (hiB - loB));
      const color = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      const alpha = Math.round(lo.alpha + t * (hi.alpha - lo.alpha));
      return { dbz, color, alpha, solid: false };
    },
    [sorted],
  );

  const handleBarClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragging.current || !barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const dbz = Math.round(barPercentToDbz(pct));
      const newStop = interpolateAtDbz(dbz);
      const newStops = [...stops, newStop];
      onChange(newStops);
      setSelected(newStops.length - 1);
    },
    [stops, onChange, interpolateAtDbz],
  );

  const startDrag = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragging.current = false;
      setSelected(index);
      const onMove = (ev: MouseEvent) => {
        dragging.current = true;
        if (!barRef.current) return;
        const rect = barRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
        const dbz = Math.round(barPercentToDbz(pct));
        onChange(stops.map((s, i) => (i === index ? { ...s, dbz } : s)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setTimeout(() => { dragging.current = false; }, 50);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [stops, onChange],
  );

  const updateStop = (index: number, patch: Partial<ColorStop>) => {
    onChange(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeStop = (index: number) => {
    if (stops.length <= 2) return;
    onChange(stops.filter((_, i) => i !== index));
    setSelected(null);
  };

  const handleExport = () => {
    const blob = new Blob([serializePal(stops)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reflectivity.pal";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        if (file.name.endsWith(".json")) {
          onChange(fromWindyJson(text));
        } else {
          onChange(parsePal(text).stops);
        }
        setSelected(null);
      } catch {
        alert(
          "Invalid palette file.\n\nExpected RadarScope .pal format:\n" +
          "Product: BR\nUnits: DBZ\nColor4: 10 0 255 0 255",
        );
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const selStop = selected !== null ? stops[selected] : null;

  return (
    <div className="space-y-3 select-none">

      <div>
        <div
          ref={barRef}
          className="h-10 rounded-lg cursor-crosshair relative border border-gray-600 overflow-visible"
          style={{ background: gradient }}
          onClick={handleBarClick}
        >
          {tickMarks.map((d) => (
            <div
              key={d}
              className="absolute top-0 bottom-0 w-px bg-black/25 pointer-events-none"
              style={{ left: `${dbzToBarPercent(d)}%` }}
            />
          ))}

          {stops.map((stop, i) => {
            const isSelected = selected === i;
            return (
              <div
                key={`${stop.dbz}-${i}`}
                className="absolute top-0 flex flex-col items-center"
                style={{
                  left: `${dbzToBarPercent(stop.dbz)}%`,
                  transform: "translateX(-50%)",
                  zIndex: isSelected ? 20 : 10,
                }}
                onClick={(e) => { e.stopPropagation(); setSelected(i); }}
                onMouseDown={(e) => startDrag(i, e)}
              >
                <div
                  className="w-0 h-0"
                  style={{
                    borderLeft: "5px solid transparent",
                    borderRight: "5px solid transparent",
                    borderTop: `7px solid ${isSelected ? "#ffffff" : stop.solid ? "#fbbf24" : "#888"}`,
                  }}
                />
                <div
                  className="w-3 h-3 rounded-full border-2 -mt-0.5 cursor-grab"
                  style={{
                    background: stop.color,
                    borderColor: isSelected ? "#ffffff" : stop.solid ? "#fbbf24" : "#555",
                    opacity: Math.max(0.35, stop.alpha / 255),
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-between text-[10px] text-gray-500 mt-1 px-0.5 font-mono">
          <span>{PAL_DBZ_MIN} dBZ</span>
          <span>20</span>
          <span>40</span>
          <span>60</span>
          <span>{PAL_DBZ_MAX} dBZ</span>
        </div>
        <p className="text-[10px] text-gray-600 mt-0.5">
          RadarScope format · click to add · drag handles · gold = SolidColor band
        </p>
      </div>

      {selStop !== null && selected !== null && (
        <div className="bg-gray-800/80 rounded-lg p-3 border border-gray-700 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-300 font-medium">
              <span className="text-blue-400 font-mono">{selStop.dbz} dBZ</span>
              <span className="text-gray-600 ml-2 text-[10px]">
                {selStop.solid ? "SolidColor" : "Color"} band
              </span>
            </span>
            <button
              onClick={() => removeStop(selected)}
              disabled={stops.length <= 2}
              className="text-gray-500 hover:text-red-400 disabled:opacity-20 transition-colors p-0.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={selStop.solid}
              onChange={(e) => updateStop(selected, { solid: e.target.checked })}
              className="accent-amber-500"
            />
            SolidColor (flat band to next stop)
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block uppercase tracking-wide">Color</label>
              <input
                type="color"
                value={selStop.color}
                onChange={(e) => updateStop(selected, { color: e.target.value })}
                className="w-full h-9 rounded-md cursor-pointer border border-gray-600 bg-gray-700 p-0.5"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wide">Opacity</label>
                <span className="text-[10px] text-blue-400">{Math.round((selStop.alpha / 255) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={255}
                step={1}
                value={selStop.alpha}
                onChange={(e) => updateStop(selected, { alpha: Number(e.target.value) })}
                className="w-full accent-blue-500 mt-2"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wide">dBZ</label>
              <span className="text-[10px] text-blue-400 font-mono">{selStop.dbz} dBZ</span>
            </div>
            <input
              type="range"
              min={PAL_DBZ_MIN}
              max={PAL_DBZ_MAX}
              step={1}
              value={selStop.dbz}
              onChange={(e) => updateStop(selected, { dbz: Number(e.target.value) })}
              className="w-full accent-blue-500"
            />
          </div>
        </div>
      )}

      <button
        onClick={() => {
          onChange([...stops, { dbz: 35, color: "#ffffff", alpha: 255, solid: false }]);
          setSelected(stops.length);
        }}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-gray-700 text-xs text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
      >
        <Plus className="w-3 h-3" /> Add color stop
      </button>

      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
        >
          <Download className="w-3 h-3" /> Export .pal
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
        >
          <Upload className="w-3 h-3" /> Import .pal
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pal,.txt,.json"
          onChange={handleImport}
          className="hidden"
        />
      </div>
    </div>
  );
}
