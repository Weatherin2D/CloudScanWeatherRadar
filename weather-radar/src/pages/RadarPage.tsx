import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  Cloud, Play, Pause, ChevronLeft, ChevronRight, Clock,
  Layers, Zap, Radio, Map, X, Info, Settings, Palette, AlertTriangle, Pencil,
} from "lucide-react";
import {
  ALL_STATIONS,
  STATION_RADAR_PRODUCTS,
  EU_STATION_PRODUCTS,
  COUNTRY_FLAGS,
  type RadarStation,
} from "@/data/stations";
import { useNWSStations } from "@/hooks/useNWSStations";
import { useStationRadarFrames } from "@/hooks/useStationRadarFrames";
import { useLevel3RadarFrames } from "@/hooks/useLevel3RadarFrames";
import { useOperaRadarFrames } from "@/hooks/useOperaRadarFrames";
import { useLightning } from "@/hooks/useLightning";
import { isIemProductSupported, isReflectivityProduct } from "@/lib/iemRadar";
import {
  productSourceForCountry,
  isReflectivityFamily,
  type RadarProduct,
} from "@/lib/radarProducts";
import StationMarkers from "@/components/StationMarkers";
import StationRadarLayer, { type StationRadarStatus } from "@/components/StationRadarLayer";
import LightningLayer from "@/components/LightningLayer";
import ColorScaleEditor from "@/components/ColorScaleEditor";
import CanvasRainViewerLayer from "@/components/CanvasRainViewerLayer";
import StandardRainViewerLayer from "@/components/StandardRainViewerLayer";
import MapFlyTo from "@/components/MapFlyTo";
import MapDrawingLayer, { type DrawTool } from "@/components/MapDrawingLayer";
import DrawingToolbar from "@/components/DrawingToolbar";
import { isStationSupported, stationSupportHint } from "@/lib/stationSupport";
import {
  DEFAULT_CUSTOM_STOPS,
  stopsToRainViewerLUT,
  stopsToIemIndexLUT,
  normalizeReflectivityFade,
  stopsToCss,
  stopsValueSpan,
  type ColorStop,
} from "@/lib/colorScale";

const Level3RadarLayer = lazy(() => import("@/components/Level3RadarLayer"));
const OperaRadarLayer = lazy(() => import("@/components/OperaRadarLayer"));

// ─── Types ────────────────────────────────────────────────────────────────────
interface RainViewerFrame { time: number; path: string }

// ─── RainViewer color schemes ─────────────────────────────────────────────────
const COLOR_SCHEMES = [
  { id: 0, label: "Black & White",   preview: "linear-gradient(to right,#111,#888,#fff)" },
  { id: 1, label: "Original",        preview: "linear-gradient(to right,#00aaff,#00ff00,#ffff00,#ff8800,#ff0000)" },
  { id: 2, label: "Universal Blue",  preview: "linear-gradient(to right,#0088ff,#00ff88,#ffff00,#ff8800,#ff0000)" },
  { id: 3, label: "TITAN",           preview: "linear-gradient(to right,#00ffff,#00cc00,#ffff00,#ff0000,#aa00ff)" },
  { id: 4, label: "TWC",             preview: "linear-gradient(to right,#a0c8f0,#00aaff,#00ff00,#ffff00,#ff6600,#ff0000)" },
  { id: 5, label: "Meteored",        preview: "linear-gradient(to right,#aaaaff,#0000ff,#00ff00,#ffff00,#ff0000,#800000)" },
  { id: 6, label: "NEXRAD",          preview: "linear-gradient(to right,#04e9e7,#019ff4,#0300f4,#02fd02,#01c501,#fdf802,#fd9500,#fd0000,#bc0000)" },
  { id: 7, label: "Rainbow",         preview: "linear-gradient(to right,#ff00ff,#8800ff,#0000ff,#00ffff,#00ff00,#ffff00,#ff0000)" },
  { id: 8, label: "Dark Sky",        preview: "linear-gradient(to right,#082060,#1040b0,#20a0f0,#80f0a0,#ffff60,#f08010,#d03020)" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(unix: number) {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
}

// ─── Settings panel ───────────────────────────────────────────────────────────
interface AppSettings {
  animSpeed: number;
  frameLimit: number;
  colorScheme: number;   // -1 = custom canvas scale
  customStops: ColorStop[];
  /** dBZ where reflectivity opacity is 0%. */
  reflectivityFadeStartDbz: number;
  /** dBZ where reflectivity reaches full palette opacity. */
  reflectivityFadeEndDbz: number;
  lightningSize: number;
  lightningMaxAge: number;
}

function SettingsPanel({
  settings, onChange, onClose, maxFrames,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  maxFrames: number;
}) {
  const {
    animSpeed, frameLimit, colorScheme, customStops = DEFAULT_CUSTOM_STOPS,
    reflectivityFadeStartDbz, reflectivityFadeEndDbz,
    lightningSize, lightningMaxAge,
  } = settings;
  const fps = (1000 / animSpeed).toFixed(1);

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-[1999]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-72 z-[2000] bg-gray-900 border-l border-gray-700 overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-400" /> Settings
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-6">

          {/* ── Playback ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Playback</h3>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-gray-300">Animation Speed</label>
                <span className="text-xs text-blue-400 font-mono">{fps} fps</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-7">Fast</span>
                <input type="range" min={100} max={2000} step={100} value={animSpeed}
                  onChange={e => onChange({ animSpeed: Number(e.target.value) })}
                  className="flex-1 accent-blue-500 h-1.5" />
                <span className="text-xs text-gray-500 w-7">Slow</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-gray-300">Frame Count</label>
                <span className="text-xs text-blue-400 font-mono">
                  {Math.min(frameLimit, maxFrames || frameLimit)} / {maxFrames || "…"} frames
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-7">1</span>
                <input type="range" min={1} max={maxFrames || 16} step={1} value={Math.min(frameLimit, maxFrames || frameLimit)}
                  onChange={e => onChange({ frameLimit: Number(e.target.value) })}
                  className="flex-1 accent-blue-500 h-1.5" />
                <span className="text-xs text-gray-500 w-7">{maxFrames || 16}</span>
              </div>
            </div>
          </section>

          {/* ── Color Scale ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Color Scale</h3>
            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              {COLOR_SCHEMES.map(cs => (
                <button
                  key={cs.id}
                  onClick={() => onChange({ colorScheme: cs.id })}
                  className={`text-left p-2 rounded-lg border transition-all ${
                    colorScheme === cs.id
                      ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/40"
                      : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/50"
                  }`}
                >
                  <div className="h-2 w-full rounded mb-1.5" style={{ background: cs.preview }} />
                  <span className="text-xs text-gray-300">{cs.label}</span>
                </button>
              ))}

              {/* Custom scale button */}
              <button
                onClick={() => onChange({ colorScheme: -1 })}
                className={`text-left p-2 rounded-lg border transition-all col-span-2 ${
                  colorScheme === -1
                    ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/40"
                    : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/50"
                }`}
              >
                <div className="h-2 w-full rounded mb-1.5" style={{ background: stopsToCss(customStops) }} />
                <span className="text-xs text-gray-300 flex items-center gap-1.5">
                  <Palette className="w-3 h-3 text-purple-400" /> RadarScope Palette
                  {colorScheme === -1 && <span className="ml-auto text-[10px] text-purple-400 font-medium">ACTIVE</span>}
                </span>
              </button>
            </div>

            {/* Inline colour scale editor — shown when custom is active */}
            {colorScheme === -1 && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-widest font-medium">
                  Palette Editor (.pal)
                </p>
                <ColorScaleEditor
                  stops={customStops}
                  onChange={stops => onChange({ customStops: stops })}
                />
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">
                Low dBZ fade
              </p>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm text-gray-300">Fade starts at</label>
                  <span className="text-xs text-purple-400 font-mono">{reflectivityFadeStartDbz} dBZ</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-8">−10</span>
                  <input
                    type="range"
                    min={-10}
                    max={15}
                    step={0.5}
                    value={reflectivityFadeStartDbz}
                    onChange={(e) => {
                      const start = Number(e.target.value);
                      const patch: Partial<AppSettings> = { reflectivityFadeStartDbz: start };
                      if (start >= reflectivityFadeEndDbz) {
                        patch.reflectivityFadeEndDbz = start + 1;
                      }
                      onChange(patch);
                    }}
                    className="flex-1 accent-purple-500 h-1.5"
                  />
                  <span className="text-xs text-gray-500 w-8">15</span>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">0% opacity at and below this value</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm text-gray-300">Full opacity at</label>
                  <span className="text-xs text-purple-400 font-mono">{reflectivityFadeEndDbz} dBZ</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-8">3</span>
                  <input
                    type="range"
                    min={3}
                    max={30}
                    step={0.5}
                    value={reflectivityFadeEndDbz}
                    onChange={(e) => {
                      const end = Number(e.target.value);
                      const patch: Partial<AppSettings> = { reflectivityFadeEndDbz: end };
                      if (end <= reflectivityFadeStartDbz) {
                        patch.reflectivityFadeStartDbz = end - 1;
                      }
                      onChange(patch);
                    }}
                    className="flex-1 accent-purple-500 h-1.5"
                  />
                  <span className="text-xs text-gray-500 w-8">30</span>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">100% opacity at and above this value</p>
              </div>

              <div
                className="h-2 w-full rounded border border-gray-700"
                style={{
                  background: `linear-gradient(to right, transparent 0%, white ${Math.min(100, Math.max(0, ((reflectivityFadeEndDbz - reflectivityFadeStartDbz) / 30) * 100))}%)`,
                }}
              />
            </div>
          </section>

          {/* ── Lightning ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">Lightning</h3>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-gray-300">Marker Size</label>
                <span className="text-xs text-yellow-400 font-mono">{lightningSize.toFixed(1)}×</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-7">Tiny</span>
                <input type="range" min={0.5} max={3} step={0.25} value={lightningSize}
                  onChange={e => onChange({ lightningSize: Number(e.target.value) })}
                  className="flex-1 accent-yellow-500 h-1.5" />
                <span className="text-xs text-gray-500 w-7">Big</span>
              </div>
              {/* Live size preview */}
              <div className="flex items-center gap-2 mt-2 pl-7">
                {[1, 0.55, 0.25].map((opacity) => (
                  <svg
                    key={opacity}
                    viewBox="0 0 12 22"
                    width={Math.max(6, 10 * lightningSize)}
                    height={Math.max(10, 18 * lightningSize)}
                    style={{ opacity: Math.max(0.25, opacity) }}
                  >
                    <polygon
                      points="9,0 2,12 7,12 3,22 11,10 6,10"
                      fill="white"
                    />
                  </svg>
                ))}
                <span className="text-xs text-gray-500 ml-1">preview</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-gray-300">Show strikes from last</label>
                <span className="text-xs text-yellow-400 font-mono">{lightningMaxAge} min</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-7">1m</span>
                <input type="range" min={1} max={60} step={1} value={lightningMaxAge}
                  onChange={e => onChange({ lightningMaxAge: Number(e.target.value) })}
                  className="flex-1 accent-yellow-500 h-1.5" />
                <span className="text-xs text-gray-500 w-7">60m</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

// ─── Station info panel ────────────────────────────────────────────────────────
function stationProductsFor(station: RadarStation): RadarProduct[] {
  if (station.country === "us") {
    return STATION_RADAR_PRODUCTS.filter((p) => p.sources.us);
  }
  if (station.country === "eu") {
    return EU_STATION_PRODUCTS;
  }
  return [];
}

function StationPanel({
  station, product, products, onProductChange, onClose,
}: {
  station: RadarStation;
  product: RadarProduct;
  products: RadarProduct[];
  onProductChange: (p: RadarProduct) => void;
  onClose: () => void;
}) {
  const flag = COUNTRY_FLAGS[station.countryCode] ?? "📡";
  const hasProducts = products.length > 0;

  return (
    <div className="absolute top-2 right-2 z-[500] bg-gray-900/95 backdrop-blur border border-gray-700 rounded-xl shadow-2xl w-64 overflow-hidden pointer-events-auto">
      <div className="flex items-start justify-between p-3 border-b border-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">{flag}</span>
            <span className="font-mono text-sm font-bold text-blue-400">{station.id}</span>
          </div>
          <p className="text-sm text-gray-200 mt-0.5 leading-tight">{station.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {station.lat.toFixed(3)}, {station.lon.toFixed(3)}
            {station.elevation !== undefined && ` · ${Math.round(station.elevation)}m`}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white p-1 -mt-1 -mr-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3">
        <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">
          {hasProducts ? "Radar Product" : "Data Source"}
        </p>
        {hasProducts ? (
          <div className="grid grid-cols-1 gap-1.5">
            {products.map(p => (
              <button key={p.id} onClick={() => onProductChange(p)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                  product.id === p.id
                    ? "text-white border-opacity-50"
                    : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
                }`}
                style={product.id === p.id ? { borderColor: p.color + "80", backgroundColor: p.color + "20", color: p.color } : {}}>
                <span className="font-mono font-bold w-10">{p.shortLabel}</span>
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-amber-400/80 leading-relaxed">
            Per-station radar is available for US NEXRAD and supported European OPERA sites. Switch to Global mode for worldwide composite.
          </p>
        )}
        {hasProducts && (
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">{product.description}</p>
        )}
        {!isStationSupported(station) && (
          <p className="text-xs text-red-400/90 mt-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {stationSupportHint(station)}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const GLOBAL_CENTER: [number, number] = [48, -18];
const GLOBAL_ZOOM = 3;

const DEFAULT_SETTINGS: AppSettings = {
  animSpeed: 600,
  frameLimit: 999,
  colorScheme: -1,
  customStops: DEFAULT_CUSTOM_STOPS,
  reflectivityFadeStartDbz: 0,
  reflectivityFadeEndDbz: 10,
  lightningSize: 1,
  lightningMaxAge: 15,
};

export default function RadarPage() {
  const [mode, setMode]                 = useState<"overview" | "station">("overview");
  const [frames, setFrames]             = useState<RainViewerFrame[]>([]);
  const [frameIndex, setFrameIndex]     = useState(0);
  const [playing, setPlaying]           = useState(true);
  const [opacity, setOpacity]           = useState(0.8);
  const [loading, setLoading]           = useState(true);
  const [mapType, setMapType]           = useState<"dark" | "satellite">("dark");
  const [selectedStation, setSelectedStation] = useState<RadarStation | null>(null);
  const [selectedProduct, setSelectedProduct] = useState(STATION_RADAR_PRODUCTS[0]);
  const [lightningEnabled, setLightningEnabled] = useState(false);
  const [stationSearch, setStationSearch] = useState("");
  const [mapZoom, setMapZoom]           = useState(GLOBAL_ZOOM);
  const [panelOpen, setPanelOpen]       = useState(true);
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [legendVisible, setLegendVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings]         = useState<AppSettings>(DEFAULT_SETTINGS);
  const [stationRadarStatus, setStationRadarStatus] = useState<StationRadarStatus>("idle");
  const [drawMode, setDrawMode] = useState(false);
  const [drawTool, setDrawTool] = useState<DrawTool>("freehand");
  const [drawColor, setDrawColor] = useState("#f59e0b");
  const [drawUndoSignal, setDrawUndoSignal] = useState(0);
  const [drawClearSignal, setDrawClearSignal] = useState(0);
  const [drawShapeCount, setDrawShapeCount] = useState(0);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    if (!drawMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawMode]);

  const reflectivityFade = useMemo(
    () => normalizeReflectivityFade(
      settings.reflectivityFadeStartDbz,
      settings.reflectivityFadeEndDbz,
    ),
    [settings.reflectivityFadeStartDbz, settings.reflectivityFadeEndDbz],
  );

  const rainViewerLUT = useMemo(
    () => stopsToRainViewerLUT(settings.customStops, reflectivityFade),
    [settings.customStops, reflectivityFade],
  );
  const stationIemLUT = useMemo(
    () => stopsToIemIndexLUT(settings.customStops, reflectivityFade),
    [settings.customStops, reflectivityFade],
  );

  const { stations: usStations, loading: usLoading } = useNWSStations();
  const stationForHooks = mode === "station" ? selectedStation : null;
  const { frames: stationFrames, loading: stationFramesLoading } = useStationRadarFrames(
    stationForHooks,
    selectedProduct.id,
  );
  const { frames: level3Frames, loading: level3Loading } = useLevel3RadarFrames(
    stationForHooks,
    selectedProduct.id,
  );
  const { frames: operaFrames, loading: operaLoading, hasOpera } = useOperaRadarFrames(
    stationForHooks,
    selectedProduct.id,
  );
  const strikes = useLightning(lightningEnabled);

  const stationProductList = useMemo(
    () => (selectedStation ? stationProductsFor(selectedStation) : []),
    [selectedStation],
  );

  const dataSource = selectedStation
    ? productSourceForCountry(selectedProduct.id, selectedStation.country)
    : null;

  const allStations: RadarStation[] = useMemo(
    () => [...usStations, ...ALL_STATIONS],
    [usStations]
  );

  const visibleStations = useMemo(() => allStations.filter(s => {
    const matchSearch = !stationSearch ||
      s.name.toLowerCase().includes(stationSearch.toLowerCase()) ||
      s.id.toLowerCase().includes(stationSearch.toLowerCase());
    const matchCountry = filterCountry === "all" || s.country === filterCountry || s.countryCode === filterCountry;
    return matchSearch && matchCountry;
  }), [allStations, stationSearch, filterCountry]);

  // Fetch RainViewer frames
  useEffect(() => {
    setLoading(true);
    fetch("https://api.rainviewer.com/public/weather-maps.json")
      .then(r => r.json())
      .then(data => {
        const past: RainViewerFrame[]    = (data.radar?.past ?? []).map((f: any) => ({ time: f.time, path: f.path }));
        const nowcast: RainViewerFrame[] = (data.radar?.nowcast ?? []).slice(0, 3).map((f: any) => ({ time: f.time, path: f.path }));
        const all = [...past, ...nowcast];
        setFrames(all);
        setFrameIndex(past.length > 0 ? past.length - 1 : 0);
        // Default frame limit = all frames
        setSettings(prev => ({ ...prev, frameLimit: all.length }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Derive display frames from frameLimit setting
  const displayFrames = useMemo(() => {
    if (!frames.length) return [];
    const limit = Math.min(settings.frameLimit, frames.length);
    return frames.slice(-limit);
  }, [frames, settings.frameLimit]);

  const activeStationFrames = useMemo(() => {
    if (mode !== "station" || !selectedStation) return [];
    if (dataSource === "iem") return stationFrames;
    if (dataSource === "level3") return level3Frames;
    if (dataSource === "opera") return operaFrames;
    return [];
  }, [mode, selectedStation, dataSource, stationFrames, level3Frames, operaFrames]);

  const useStationTimeline = mode === "station" && activeStationFrames.length > 0;

  const timelineFrames = useMemo(
    () => (useStationTimeline ? activeStationFrames : displayFrames),
    [useStationTimeline, activeStationFrames, displayFrames],
  );

  // Jump to latest scan when station/product changes or frames finish loading
  useEffect(() => {
    if (mode === "station" && activeStationFrames.length > 0) {
      setFrameIndex(activeStationFrames.length - 1);
      setPlaying(true);
    }
  }, [selectedStation?.id, selectedProduct.id, mode, activeStationFrames.length]);

  // Keep frameIndex in bounds when timeline shrinks
  useEffect(() => {
    if (timelineFrames.length > 0 && frameIndex >= timelineFrames.length) {
      setFrameIndex(timelineFrames.length - 1);
    }
  }, [timelineFrames.length, frameIndex]);

  // Auto-play
  useEffect(() => {
    if (!playing || timelineFrames.length === 0) return;
    playRef.current = setInterval(
      () => setFrameIndex(i => (i + 1) % timelineFrames.length),
      settings.animSpeed
    );
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing, timelineFrames.length, settings.animSpeed]);

  const stepFrame = (dir: number) => {
    setPlaying(false);
    setFrameIndex(i => Math.max(0, Math.min(timelineFrames.length - 1, i + dir)));
  };

  const handleSelectStation = useCallback((station: RadarStation) => {
    const list = stationProductsFor(station);
    if (list.length > 0 && !list.some((p) => p.id === selectedProduct.id)) {
      setSelectedProduct(list[0]);
    }
    setSelectedStation(station);
    setStationRadarStatus("loading");
  }, [selectedProduct.id]);

  useEffect(() => {
    if (mode !== "station" || !selectedStation) {
      setStationRadarStatus("idle");
      return;
    }
    if (!dataSource) {
      setStationRadarStatus("unsupported");
      return;
    }
    if (dataSource === "opera" && !hasOpera) {
      setStationRadarStatus("unsupported");
      return;
    }
    if (dataSource === "iem" && !isIemProductSupported(selectedProduct.id)) {
      setStationRadarStatus("unsupported");
      return;
    }
    const loading =
      dataSource === "iem"
        ? stationFramesLoading
        : dataSource === "level3"
          ? level3Loading
          : operaLoading;
    if (loading) {
      setStationRadarStatus("loading");
      return;
    }
    setStationRadarStatus(activeStationFrames.length > 0 ? "ready" : "unavailable");
  }, [
    mode,
    selectedStation,
    selectedProduct.id,
    dataSource,
    hasOpera,
    activeStationFrames.length,
    stationFramesLoading,
    level3Loading,
    operaLoading,
  ]);

  const handleProductChange = useCallback((product: RadarProduct) => {
    setSelectedProduct(product);
    setStationRadarStatus("loading");
  }, []);

  const currentFrame = timelineFrames[frameIndex];

  const tileLayers = {
    dark:      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  };

  const COUNTRY_GROUPS = [
    { id: "all", label: "All" },
    { id: "us",  label: "🇺🇸 USA" },
    { id: "uk",  label: "🇬🇧 UK" },
    { id: "eu",  label: "🇪🇺 Europe" },
    { id: "au",  label: "🇦🇺 Australia" },
  ];

  const currentColorScheme = COLOR_SCHEMES.find(c => c.id === settings.colorScheme) ?? COLOR_SCHEMES[2];
  const isCustomScale = settings.colorScheme === -1;
  const stationPaletteStops = useMemo(() => {
    if (mode === "station" && isCustomScale && isReflectivityFamily(selectedProduct.family)) {
      return settings.customStops;
    }
    return selectedProduct.defaultStops;
  }, [mode, isCustomScale, selectedProduct, settings.customStops]);
  const stationLegendSpan = useMemo(
    () => stopsValueSpan(stationPaletteStops),
    [stationPaletteStops],
  );
  const legendGradient =
    mode === "station"
      ? stopsToCss(stationPaletteStops, stationLegendSpan.min, stationLegendSpan.max)
      : isCustomScale
        ? stopsToCss(settings.customStops)
        : currentColorScheme.preview;
  const legendScaleLabel =
    mode === "station"
      ? selectedProduct.label
      : isCustomScale
        ? "RadarScope"
        : currentColorScheme.label;
  const legendMin =
    mode === "station" ? (selectedProduct.legendMin ?? "Light") : "Light";
  const legendMax =
    mode === "station" ? (selectedProduct.legendMax ?? "Heavy") : "Heavy";

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="relative flex items-center gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800 z-[1000] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <span className="font-bold tracking-tight hidden sm:block">CloudScan</span>
        </div>
        <div className="w-px h-5 bg-gray-700 mx-1 hidden sm:block" />

        {/* Mode toggle */}
        <div className="flex gap-0.5 bg-gray-800 rounded-lg p-1">
          <button onClick={() => setMode("overview")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium transition-all ${mode === "overview" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
            <Map className="w-3.5 h-3.5" /><span>Global</span>
          </button>
          <button onClick={() => setMode("station")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium transition-all ${mode === "station" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
            <Radio className="w-3.5 h-3.5" /><span>Station</span>
          </button>
        </div>

        {/* Lightning toggle */}
        <button onClick={() => setLightningEnabled(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium border transition-all ${lightningEnabled ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-300" : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"}`}>
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Lightning</span>
          {lightningEnabled && strikes.length > 0 && (
            <span className="bg-yellow-500/30 text-yellow-300 text-xs px-1.5 rounded-full">{strikes.length.toLocaleString()}</span>
          )}
        </button>

        {/* Per-station product menu */}
        {mode === "station" && selectedStation && stationProductList.length > 0 && (
          <div className="flex gap-0.5 bg-gray-800 rounded-lg p-1 border border-gray-700 max-w-[50vw] overflow-x-auto">
            {stationProductList.map((p) => (
              <button
                key={p.id}
                onClick={() => handleProductChange(p)}
                title={p.description}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  selectedProduct.id === p.id
                    ? "text-white shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
                style={selectedProduct.id === p.id ? { backgroundColor: p.color + "cc" } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Map type */}
        <button onClick={() => setMapType(t => t === "dark" ? "satellite" : "dark")}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-700 transition-all">
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:block">{mapType === "dark" ? "Satellite" : "Dark"}</span>
        </button>

        {/* Draw */}
        <button
          onClick={() => setDrawMode(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm border transition-all ${
            drawMode
              ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
              : "text-gray-400 hover:text-white hover:bg-gray-800 border-gray-700"
          }`}
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Draw</span>
        </button>

        {/* Settings */}
        <button onClick={() => setSettingsOpen(v => !v)}
          className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm border transition-all ${settingsOpen ? "bg-gray-700 border-gray-500 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800 border-gray-700"}`}>
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Settings</span>
        </button>
      </header>

      {/* Settings drawer (rendered outside body flow, fixed) */}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={patchSettings}
          onClose={() => setSettingsOpen(false)}
          maxFrames={frames.length}
        />
      )}

      {/* ─── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Station side panel */}
        {mode === "station" && panelOpen && (
          <div className="relative z-[1000] w-60 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
            <div className="p-2 border-b border-gray-800 flex flex-wrap gap-1">
              {COUNTRY_GROUPS.map(g => (
                <button key={g.id} onClick={() => setFilterCountry(g.id)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${filterCountry === g.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700"}`}>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="p-2 border-b border-gray-800">
              <input type="text" placeholder="Search stations…"
                value={stationSearch} onChange={e => setStationSearch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-800">
              {usLoading ? "Loading US stations…" : `${visibleStations.length} stations`}
            </div>
            <div className="flex-1 overflow-y-auto text-xs">
              {visibleStations.map(s => {
                const flag = COUNTRY_FLAGS[s.countryCode] ?? "📡";
                const isSelected = selectedStation?.id === s.id;
                const supported = isStationSupported(s);
                return (
                  <button key={s.id} onClick={() => handleSelectStation(s)}
                    title={stationSupportHint(s)}
                    className={`w-full text-left px-3 py-2 border-b border-gray-800/50 transition-colors flex items-start gap-2 ${
                      isSelected
                        ? "bg-gray-600/40 border-l-2 border-l-gray-400"
                        : "hover:bg-gray-800"
                    }`}>
                    <span className="flex-shrink-0 mt-0.5">{flag}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`font-mono font-semibold ${isSelected ? "text-gray-300" : "text-blue-400"}`}>{s.id}</div>
                      <div className="text-gray-300 truncate">{s.name}</div>
                    </div>
                    {!supported && (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" aria-label="No per-station data" />
                    )}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setPanelOpen(false)}
              className="p-2 text-xs text-gray-500 hover:text-white border-t border-gray-800 transition-colors text-center">
              Hide panel
            </button>
          </div>
        )}

        {/* Map area */}
        <div className="flex-1 relative radar-map isolate">
          {loading && (
            <div className="absolute inset-0 z-[600] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm pointer-events-auto">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Loading radar data…</p>
              </div>
            </div>
          )}

          {mode === "station" && selectedStation && (
            <StationPanel
              station={selectedStation}
              product={selectedProduct}
              products={stationProductList}
              onProductChange={handleProductChange}
              onClose={() => setSelectedStation(null)}
            />
          )}

          {mode === "station" && !panelOpen && (
            <button onClick={() => setPanelOpen(true)}
              className="absolute top-2 left-2 z-[500] flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-xl text-sm text-gray-300 hover:text-white transition-colors pointer-events-auto">
              <Radio className="w-3.5 h-3.5 text-blue-400" /> Stations
            </button>
          )}

          {drawMode && (
            <div className={`absolute z-[500] pointer-events-none ${mode === "station" && !panelOpen ? "top-14 left-2" : "top-2 left-2"}`}>
              <DrawingToolbar
                tool={drawTool}
                color={drawColor}
                shapeCount={drawShapeCount}
                onToolChange={setDrawTool}
                onColorChange={setDrawColor}
                onUndo={() => setDrawUndoSignal(n => n + 1)}
                onClear={() => setDrawClearSignal(n => n + 1)}
                onClose={() => setDrawMode(false)}
              />
            </div>
          )}

          <MapContainer center={GLOBAL_CENTER} zoom={GLOBAL_ZOOM}
            style={{ width: "100%", height: "100%" }}
            zoomControl={true} attributionControl={false} worldCopyJump={true}>

            <TileLayer url={tileLayers[mapType]} />
            <ZoomTracker onZoom={setMapZoom} />

            {mode === "overview" && (
              isCustomScale ? (
                <CanvasRainViewerLayer
                  frames={displayFrames}
                  frameIndex={frameIndex}
                  opacity={opacity}
                  lut={rainViewerLUT}
                />
              ) : (
                <StandardRainViewerLayer
                  frames={displayFrames}
                  frameIndex={frameIndex}
                  opacity={opacity}
                  colorScheme={settings.colorScheme}
                />
              )
            )}

            {mode === "station" && (
              <>
                <MapFlyTo station={selectedStation} />
                <StationMarkers
                  stations={visibleStations}
                  selected={selectedStation}
                  onSelect={handleSelectStation}
                  zoom={mapZoom}
                />
                {selectedStation && dataSource === "iem" && (
                  <StationRadarLayer
                    station={selectedStation}
                    product={selectedProduct.id}
                    frames={stationFrames}
                    frameIndex={frameIndex}
                    opacity={opacity}
                    reflectivityLut={
                      isCustomScale && isReflectivityProduct(selectedProduct.id)
                        ? stationIemLUT
                        : null
                    }
                  />
                )}
                {selectedStation && dataSource === "level3" && level3Frames.length > 0 && (
                  <Suspense fallback={null}>
                    <Level3RadarLayer
                      frames={level3Frames}
                      frameIndex={frameIndex}
                      opacity={opacity}
                      stops={stationPaletteStops}
                    />
                  </Suspense>
                )}
                {selectedStation && dataSource === "opera" && operaFrames.length > 0 && (
                  <Suspense fallback={null}>
                    <OperaRadarLayer
                      station={selectedStation}
                      frames={operaFrames}
                      frameIndex={frameIndex}
                      opacity={opacity}
                      stops={stationPaletteStops}
                      reflectivity={isReflectivityFamily(selectedProduct.family)}
                      reflectivityFade={reflectivityFade}
                    />
                  </Suspense>
                )}
              </>
            )}

            {lightningEnabled && (
              <LightningLayer
                strikes={strikes}
                size={settings.lightningSize}
                maxAge={settings.lightningMaxAge}
              />
            )}

            <MapDrawingLayer
              active={drawMode}
              tool={drawTool}
              color={drawColor}
              undoSignal={drawUndoSignal}
              clearSignal={drawClearSignal}
              onShapeCount={setDrawShapeCount}
            />
          </MapContainer>

          {/* ─── Map overlays (bottom-right) ─────────────────────────────── */}
          <div className="absolute bottom-24 right-3 z-[500] flex flex-col gap-2 items-end pointer-events-none">

            <button
              onClick={() => setLegendVisible(v => !v)}
              className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700 text-xs text-gray-400 hover:text-white transition-colors">
              <Info className="w-3.5 h-3.5" />
              {legendVisible ? "Hide key" : "Show key"}
            </button>

            {legendVisible && (
              <>
                <div className="bg-gray-900/90 backdrop-blur rounded-xl p-3 border border-gray-700 pointer-events-auto">
                  <p className="text-xs text-gray-400 mb-1.5 font-medium">
                    {mode === "station" && selectedStation
                      ? `${selectedProduct.label} (${selectedProduct.id})`
                      : "Reflectivity"}
                    <span className="ml-1.5 text-gray-600">· {legendScaleLabel}</span>
                  </p>
                  <div className="h-3 w-40 rounded" style={{ background: legendGradient }} />
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>{legendMin}</span>
                    <span>{legendMax}</span>
                  </div>
                </div>

                {mode === "station" && (
                  <div className="bg-gray-900/90 backdrop-blur rounded-xl p-2.5 border border-gray-700 pointer-events-auto text-xs">
                    <p className="text-gray-400 mb-1.5 font-medium">Station types</p>
                    {[
                      { color: "#60a5fa", label: "US NEXRAD (multi-product)" },
                      { color: "#f472b6", label: "UK Met Office" },
                      { color: "#fb923c", label: "Europe (OPERA)" },
                      { color: "#34d399", label: "Australia BOM" },
                      { color: "#6b7280", label: "Selected station" },
                      { color: "#ef4444", label: "No per-station data", icon: true },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2 mb-1">
                        {"icon" in item && item.icon ? (
                          <span className="relative w-2.5 h-2.5 flex-shrink-0">
                            <span className="absolute inset-0 rounded-full bg-gray-600 border border-red-500" />
                            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 border border-white/30" />
                          </span>
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white/20" style={{ backgroundColor: item.color }} />
                        )}
                        <span className="text-gray-400">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {lightningEnabled && (
                  <div className="bg-gray-900/90 backdrop-blur rounded-xl p-2.5 border border-yellow-700/50 pointer-events-auto text-xs">
                    <div className="flex items-center gap-1.5 text-yellow-400 font-medium mb-1.5">
                      <Zap className="w-3 h-3" /> Lightning
                    </div>
                    {[
                      { opacity: 1, label: "< 1 min" },
                      { opacity: 0.65, label: "1 – 8 min" },
                      { opacity: 0.35, label: "8+ min" },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2 mb-0.5">
                        <svg viewBox="0 0 12 22" width="8" height="14" style={{ opacity: item.opacity, flexShrink: 0 }}>
                          <polygon points="9,0 2,12 7,12 3,22 11,10 6,10" fill="white" />
                        </svg>
                        <span className="text-gray-400">{item.label}</span>
                      </div>
                    ))}
                    <div className="mt-1.5 text-gray-500">
                      {strikes.filter(s => Date.now() - s.time < settings.lightningMaxAge * 60000).length.toLocaleString()} strikes · last {settings.lightningMaxAge}m
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Attribution */}
          <div className="absolute bottom-24 left-3 z-[500] text-gray-600 text-xs space-y-0.5 pointer-events-none">
            <div>
              Radar: RainViewer
              {mode === "station" && dataSource === "iem" && " · IEM/NEXRAD"}
              {mode === "station" && dataSource === "level3" && " · NOAA Level-III"}
              {mode === "station" && dataSource === "opera" && " · EUMETNET OPERA"}
            </div>
            <div>Map: CartoDB / ESRI{lightningEnabled ? " · Blitzortung" : ""}</div>
          </div>

          {mode === "station" && !selectedStation && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-gray-900/90 backdrop-blur border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-300 pointer-events-none whitespace-nowrap">
              <Radio className="w-4 h-4 inline mr-1.5 text-blue-400" />
              Click any station dot to view its radar
            </div>
          )}

          {mode === "station" && selectedStation && stationRadarStatus === "unsupported" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] max-w-md bg-amber-950/90 backdrop-blur border border-amber-700/60 rounded-xl px-4 py-2.5 text-sm text-amber-200 pointer-events-none text-center">
              {selectedProduct.label} is not available for this station. Try another product or station.
            </div>
          )}

          {mode === "station" && selectedStation && stationRadarStatus === "unavailable" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] max-w-md bg-amber-950/90 backdrop-blur border border-amber-700/60 rounded-xl px-4 py-2.5 text-sm text-amber-200 pointer-events-none text-center">
              No recent {selectedProduct.label.toLowerCase()} data for {selectedStation.id}. Try another station or product.
            </div>
          )}
        </div>
      </div>

      {/* ─── Timeline ───────────────────────────────────────────────────── */}
      <div className="relative flex-shrink-0 bg-gray-900 border-t border-gray-800 px-4 py-2.5 z-[1000]">
        <div className="max-w-5xl mx-auto">
          {currentFrame && (
            <div className="flex items-center gap-2 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <span className="text-sm font-medium">{formatTime(currentFrame.time)}</span>
              <span className="text-sm text-gray-500">{formatDate(currentFrame.time)}</span>
              {!useStationTimeline && frameIndex >= displayFrames.length - 3 && displayFrames.length > 3 && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-blue-900/60 text-blue-300 border border-blue-700/50">Forecast</span>
              )}
              {useStationTimeline && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-gray-800 text-gray-400 border border-gray-700">
                  {frameIndex + 1} / {timelineFrames.length}
                </span>
              )}
            </div>
          )}

          {timelineFrames.length > 0 && (
            <div className="flex gap-0.5 mb-2 h-2">
              {timelineFrames.map((f, i) => {
                const isForecast = !useStationTimeline && i >= displayFrames.length - 3;
                return (
                  <button key={`${f.time}-${i}`}
                    onClick={() => { setPlaying(false); setFrameIndex(i); }}
                    className={`flex-1 rounded-sm transition-all h-full ${i === frameIndex ? "bg-blue-500 scale-y-150" : isForecast ? "bg-blue-900/60 hover:bg-blue-700/60" : "bg-gray-700 hover:bg-gray-500"}`}
                    title={formatTime(f.time)} />
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => stepFrame(-1)} disabled={frameIndex === 0}
              className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors text-gray-300">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPlaying(!playing)}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => stepFrame(1)} disabled={frameIndex === timelineFrames.length - 1}
              className="p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors text-gray-300">
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500">Opacity</span>
              <input type="range" min={0.1} max={1} step={0.05} value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
                className="w-24 h-1 accent-blue-500" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
