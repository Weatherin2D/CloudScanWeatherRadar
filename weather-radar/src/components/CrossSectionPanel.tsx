import { useMemo, useRef, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import {
  crossSectionMatrix,
  type CrossSectionData,
} from "@/lib/crossSection";
import type { RhiCrossSectionData } from "@/lib/rhiCrossSection";
import { valueToColor } from "@/lib/ecmwfModels";
import { colorAtDbz, DEFAULT_PAL_STOPS } from "@/lib/palPalette";

export type CrossSectionResult =
  | { kind: "rhi"; data: RhiCrossSectionData }
  | { kind: "ecmwf"; data: CrossSectionData };

interface Props {
  result: CrossSectionResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function rhiCellColor(dbz: number | null): string {
  if (dbz == null) return "#111827";
  const [r, g, b] = colorAtDbz(dbz, DEFAULT_PAL_STOPS);
  return `rgb(${r},${g},${b})`;
}

function ecmwfCellColor(data: CrossSectionData, val: number | null): string {
  if (val == null) return "#1f2937";
  const [r, g, b] = valueToColor("temperature", val, 255);
  return `rgb(${r},${g},${b})`;
}

function RhiChart({ data }: { data: RhiCrossSectionData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maxDist = data.lineLengthKm;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = data.distancesKm.length;
    const rows = data.heightsKm.length;
    if (cols === 0 || rows === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);

    const padL = 36;
    const padR = 12;
    const padT = 8;
    const padB = 24;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const maxH = data.heightsKm[data.heightsKm.length - 1] ?? 16;

    for (let hi = 0; hi < rows; hi++) {
      for (let di = 0; di < cols; di++) {
        const val = data.values[hi][di];
        ctx.fillStyle = rhiCellColor(val);
        const x = padL + (di / Math.max(1, cols - 1)) * plotW;
        const yTop = padT + plotH - ((data.heightsKm[hi] / maxH) * plotH);
        const cellW = plotW / cols + 1;
        const cellH = plotH / rows + 1;
        ctx.fillRect(x - cellW / 2, yTop - cellH / 2, cellW, cellH);
      }
    }

    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    ctx.fillStyle = "#6b7280";
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "right";
    for (const tick of [0, 5, 10, 15]) {
      if (tick > maxH) continue;
      const y = padT + plotH - (tick / maxH) * plotH;
      ctx.fillText(`${tick}`, padL - 4, y + 3);
      ctx.strokeStyle = "#1f2937";
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.fillText("0 km", padL, padT + plotH + 16);
    ctx.fillText(`${Math.round(maxDist)} km`, padL + plotW, padT + plotH + 16);
  }, [data]);

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg overflow-hidden border border-gray-800 bg-gray-950">
        <canvas ref={canvasRef} className="w-full h-48 sm:h-56" />
        <div className="absolute right-2 top-2 flex flex-col gap-px text-[9px] font-mono">
          {[60, 50, 40, 30, 20, 10].map((dbz) => (
            <div key={dbz} className="flex items-center gap-1">
              <span
                className="w-3 h-2 rounded-sm border border-gray-700"
                style={{ backgroundColor: rhiCellColor(dbz) }}
              />
              <span className="text-gray-500">{dbz}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] text-gray-600">
        Vertical reflectivity slice along your line · height (km) vs distance · built from radar tilts
      </p>
    </div>
  );
}

function EcmwfGrid({ data }: { data: CrossSectionData }) {
  const matrix = useMemo(() => crossSectionMatrix(data), [data]);
  const maxDist = data.samples.at(-1)?.distanceKm ?? 0;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-px bg-gray-800 rounded-lg overflow-hidden border border-gray-800"
          style={{
            gridTemplateColumns: `5rem repeat(${data.samples.length}, minmax(8px, 1fr))`,
            gridTemplateRows: `repeat(${data.levelLabels.length}, 1.4rem)`,
          }}
        >
          {data.levelLabels.map((label, row) => (
            <div
              key={label}
              className="text-[10px] text-gray-500 flex items-center pr-2 justify-end bg-gray-900 sticky left-0"
              style={{ gridColumn: 1, gridRow: row + 1 }}
            >
              {label}
            </div>
          ))}
          {matrix.flatMap((row, rowIdx) =>
            row.map((val, colIdx) => (
              <div
                key={`${rowIdx}-${colIdx}`}
                title={`${data.levelLabels[rowIdx]} · ${Math.round(data.samples[colIdx]?.distanceKm ?? 0)} km · ${val != null ? `${val.toFixed(1)}°C` : "—"}`}
                style={{
                  gridColumn: colIdx + 2,
                  gridRow: rowIdx + 1,
                  backgroundColor: ecmwfCellColor(data, val),
                }}
              />
            )),
          )}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 px-1">
        <span>Start · 0 km</span>
        <span>{Math.round(maxDist)} km</span>
      </div>
    </div>
  );
}

export default function CrossSectionPanel({ result, loading, error, onClose }: Props) {
  const title =
    result?.kind === "rhi"
      ? "Cross-section · Radar reflectivity (RHI)"
      : result?.kind === "ecmwf"
        ? "Cross-section · Temperature"
        : "Cross-section";

  const subtitle =
    result?.kind === "rhi"
      ? result.data.subtitle
      : result?.kind === "ecmwf"
        ? result.data.subtitle
        : null;

  const time =
    result?.kind === "rhi"
      ? result.data.time
      : result?.kind === "ecmwf"
        ? result.data.time
        : "";

  return (
    <div className="h-full flex flex-col bg-gray-950 border-t border-gray-800">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && (
            <p className="text-[10px] text-gray-500">
              {subtitle}
              {time ? ` · ${new Date(time).toLocaleString()}` : ""}
            </p>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 h-full text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Building cross-section…
          </div>
        )}
        {error && !loading && (
          <p className="text-sm text-red-400 text-center py-8">{error}</p>
        )}
        {!loading && !error && result?.kind === "rhi" && (
          <RhiChart data={result.data} />
        )}
        {!loading && !error && result?.kind === "ecmwf" && (
          <EcmwfGrid data={result.data} />
        )}
        {!loading && !error && !result && (
          <p className="text-sm text-gray-500 text-center py-8">
            Enable cross-section and click two points on the map.
          </p>
        )}
      </div>
    </div>
  );
}
