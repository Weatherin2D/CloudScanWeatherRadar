import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  Cloud, Play, Pause, ChevronLeft, ChevronRight, Clock,
  Layers, Zap, Radio, Map, X, Info, Settings, Palette, AlertTriangle, Pencil, ShieldAlert,
  BarChart3, LayoutPanelTop, Globe2, Satellite, CloudRain, Crosshair,
} from "lucide-react";
import {
  ALL_STATIONS,
  STATION_RADAR_PRODUCTS,
  EU_STATION_PRODUCTS,
  COUNTRY_FLAGS,
  type RadarStation,
} from "@/data/stations";
import { useGlobalRadarFrames } from "@/hooks/useGlobalRadarFrames";
import { useNWSStations } from "@/hooks/useNWSStations";
import { useStationRadarFrames } from "@/hooks/useStationRadarFrames";
import { useLevel3RadarFrames } from "@/hooks/useLevel3RadarFrames";
import { useOperaRadarFrames } from "@/hooks/useOperaRadarFrames";
import { useLightning } from "@/hooks/useLightning";
import { useWeatherRiskOutlook } from "@/hooks/useWeatherRiskOutlook";
import { useWeatherAlerts } from "@/hooks/useWeatherAlerts";
import { useEsslOutlookImage } from "@/hooks/useEsslOutlookImage";
import WeatherRiskLayer from "@/components/WeatherRiskLayer";
import WeatherAlertsLayer from "@/components/WeatherAlertsLayer";
import EsslOutlookLayer from "@/components/EsslOutlookLayer";
import { SPC_RISK_LEGEND, MESOCAST_RISK_LEGEND, type OutlookDay } from "@/lib/convectiveRisk";
import { ALERT_SEVERITY_LEGEND, formatAlertExpiry, type WeatherAlertRecord } from "@/lib/weatherAlerts";
import { ESSL_OUTLOOK_LABELS, type EsslOutlookType } from "@/lib/esslOutlook";
import { severityColor } from "@/components/WeatherAlertsLayer";
import { isIemProductSupported, isReflectivityProduct } from "@/lib/iemRadar";
import {
  getRadarProduct,
  isReflectivityFamily,
  type RadarProduct,
} from "@/lib/radarProducts";
import {
  productSupportsTilt,
  resolveStationDataSource,
  tiltsForCountry,
  type RadarTilt,
} from "@/lib/radarTilt";
import StationMarkers from "@/components/StationMarkers";
import StationRadarLayer, { type StationRadarStatus } from "@/components/StationRadarLayer";
import LightningLayer from "@/components/LightningLayer";
import ColorScaleEditor from "@/components/ColorScaleEditor";
import GlobalRadarLayer from "@/components/GlobalRadarLayer";
import MapFlyTo from "@/components/MapFlyTo";
import MapDrawingLayer, { type DrawTool } from "@/components/MapDrawingLayer";
import DrawingToolbar from "@/components/DrawingToolbar";
import ModelFieldLayer from "@/components/ModelFieldLayer";
import ModelLayerSidebar, { ModelFieldLegend } from "@/components/ModelLayerSidebar";
import ModelTimeline from "@/components/ModelTimeline";
import AltitudeSelector from "@/components/AltitudeSelector";
import CrossSectionTool, { MapBoundsReporter } from "@/components/CrossSectionTool";
import CrossSectionPanel from "@/components/CrossSectionPanel";
import RhiCurtainOverlay from "@/components/RhiCurtainOverlay";
import RadarMapPane from "@/components/RadarMapPane";
import { MAP_MAX_BOUNDS } from "@/lib/mapConfig";
import {
  clampGlobalFrameLimit,
  clampStationFrameLimit,
  DEFAULT_RADAR_FRAME_LIMIT,
  MAX_GLOBAL_RADAR_FRAME_LIMIT,
  MAX_STATION_RADAR_FRAME_LIMIT,
  formatRadarFrameDuration,
  sliceRecentGlobalFrames,
} from "@/lib/radarFrameLimits";
import SatelliteOverlayLayer from "@/components/SatelliteOverlayLayer";
import PixelProbeTool from "@/components/PixelProbeTool";
import PixelProbePanel from "@/components/PixelProbePanel";
import {
  probeRadarPixel,
  clearLevel3ProbeCache,
  type PixelProbeContext,
  type PixelProbeResult,
} from "@/lib/pixelProbe";
import type { MapViewState } from "@/components/MapViewSync";
import { useEcmwfTimeline, useEcmwfGrid } from "@/hooks/useEcmwfModel";
import { useCrossSectionData } from "@/hooks/useCrossSectionData";
import {
  modelVariable,
  ECMWF_MODEL_LABEL,
  type ModelVariableId,
} from "@/lib/ecmwfModels";
import type { MapBounds } from "@/lib/modelGrid";
import type { LatLng } from "@/lib/crossSection";
import { anchorRadarSliceAtStation } from "@/lib/crossSection";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
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
import { RAINVIEWER_REFRESH_MS } from "@/lib/radarRefresh";
import { SATELLITE_PRODUCTS, type SatelliteProductId } from "@/lib/satelliteImagery";

const Level3RadarLayer = lazy(() => import("@/components/Level3RadarLayer"));
const OperaRadarLayer = lazy(() => import("@/components/OperaRadarLayer"));

// ─── Types ────────────────────────────────────────────────────────────────────
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
function MapViewportTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  useEffect(() => {
    onZoom(map.getZoom());
  }, [map, onZoom]);
  return null;
}

// ─── Settings panel ───────────────────────────────────────────────────────────
interface AppSettings {
  animSpeed: number;
  globalFrameLimit: number;
  stationFrameLimit: number;
  colorScheme: number;   // -1 = custom canvas scale
  customStops: ColorStop[];
  /** dBZ where reflectivity opacity is 0%. */
  reflectivityFadeStartDbz: number;
  /** dBZ where reflectivity reaches full palette opacity. */
  reflectivityFadeEndDbz: number;
  lightningSize: number;
  lightningMaxAge: number;
  weatherRiskEnabled: boolean;
  weatherRiskDay: OutlookDay;
  weatherRiskType: EsslOutlookType;
  weatherRiskOpacity: number;
  weatherAlertsEnabled: boolean;
  weatherAlertsOpacity: number;
  satelliteProduct: SatelliteProductId;
}

function SettingsPanel({
  settings, onChange, onClose,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
}) {
  const {
    animSpeed, globalFrameLimit, stationFrameLimit, colorScheme, customStops = DEFAULT_CUSTOM_STOPS,
    reflectivityFadeStartDbz, reflectivityFadeEndDbz,
    lightningSize, lightningMaxAge,
    weatherRiskEnabled, weatherRiskDay, weatherRiskType, weatherRiskOpacity,
    weatherAlertsEnabled, weatherAlertsOpacity,
    satelliteProduct,
  } = settings;
  const fps = (1000 / animSpeed).toFixed(1);
  const globalFrames = clampGlobalFrameLimit(globalFrameLimit);
  const stationFrames = clampStationFrameLimit(stationFrameLimit);

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-[1999]" onClick={onClose} />

      {/* Drawer — bottom sheet on mobile, right panel on desktop */}
      <div className="fixed bottom-0 left-0 right-0 sm:bottom-0 sm:top-0 sm:left-auto sm:right-0 sm:w-72 w-full max-h-[85vh] sm:max-h-none z-[2000] bg-gray-900 border-t sm:border-t-0 sm:border-l border-gray-700 overflow-y-auto shadow-2xl flex flex-col rounded-t-2xl sm:rounded-none">
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

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-gray-300">Global Frame Count</label>
                <span className="text-xs text-blue-400 font-mono text-right">
                  {globalFrames} / {MAX_GLOBAL_RADAR_FRAME_LIMIT}{" "}
                  ({formatRadarFrameDuration(globalFrames)} / {formatRadarFrameDuration(MAX_GLOBAL_RADAR_FRAME_LIMIT)})
                </span>
              </div>
              <p className="text-[10px] text-gray-500 mb-2">
                RainViewer worldwide + IEM US archive
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-12 text-right shrink-0">
                  1<br />({formatRadarFrameDuration(1)})
                </span>
                <input
                  type="range"
                  min={1}
                  max={MAX_GLOBAL_RADAR_FRAME_LIMIT}
                  step={1}
                  value={globalFrames}
                  onChange={e => onChange({ globalFrameLimit: Number(e.target.value) })}
                  className="flex-1 accent-blue-500 h-1.5"
                />
                <span className="text-[10px] text-gray-500 w-12 shrink-0">
                  {MAX_GLOBAL_RADAR_FRAME_LIMIT}<br />({formatRadarFrameDuration(MAX_GLOBAL_RADAR_FRAME_LIMIT)})
                </span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm text-gray-300">Station Frame Count</label>
                <span className="text-xs text-blue-400 font-mono text-right">
                  {stationFrames} / {MAX_STATION_RADAR_FRAME_LIMIT}{" "}
                  ({formatRadarFrameDuration(stationFrames)} / {formatRadarFrameDuration(MAX_STATION_RADAR_FRAME_LIMIT)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 w-12 text-right shrink-0">
                  1<br />({formatRadarFrameDuration(1)})
                </span>
                <input
                  type="range"
                  min={1}
                  max={MAX_STATION_RADAR_FRAME_LIMIT}
                  step={1}
                  value={stationFrames}
                  onChange={e => onChange({ stationFrameLimit: Number(e.target.value) })}
                  className="flex-1 accent-blue-500 h-1.5"
                />
                <span className="text-[10px] text-gray-500 w-12 shrink-0">
                  {MAX_STATION_RADAR_FRAME_LIMIT}<br />({formatRadarFrameDuration(MAX_STATION_RADAR_FRAME_LIMIT)})
                </span>
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
                  <Palette className="w-3 h-3 text-purple-400" /> Default Palette
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

          {/* ── Satellite overlay ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
              Satellite Overlay
            </h3>
            <p className="text-[10px] text-gray-600 mb-3">
              GOES full-disk imagery under radar. Auto fades visible → infrared after local sunset.
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {(Object.entries(SATELLITE_PRODUCTS) as [SatelliteProductId, typeof SATELLITE_PRODUCTS[SatelliteProductId]][]).map(
                ([id, item]) => (
                  <button
                    key={id}
                    onClick={() => onChange({ satelliteProduct: id })}
                    className={`text-left px-3 py-2 rounded-lg border transition-all ${
                      satelliteProduct === id
                        ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/40"
                        : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/50"
                    }`}
                  >
                    <span className="text-sm text-gray-200 block">{item.label}</span>
                    <span className="text-[10px] text-gray-500">{item.description}</span>
                  </button>
                ),
              )}
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

          {/* ── Convective Risk ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
              Convective Risk
            </h3>

            <button
              onClick={() => onChange({ weatherRiskEnabled: !weatherRiskEnabled })}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all mb-4 ${
                weatherRiskEnabled
                  ? "border-orange-500/60 bg-orange-500/10 text-orange-200"
                  : "border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-gray-800/50"
              }`}
            >
              <span className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Overlay convective outlook
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                weatherRiskEnabled ? "bg-orange-500/30 text-orange-200" : "bg-gray-800 text-gray-500"
              }`}>
                {weatherRiskEnabled ? "ON" : "OFF"}
              </span>
            </button>

            {weatherRiskEnabled && (
              <>
                <div className="mb-4">
                  <label className="text-sm text-gray-300 mb-2 block">Outlook day</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([1, 2, 3] as OutlookDay[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => onChange({ weatherRiskDay: d })}
                        className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                          weatherRiskDay === d
                            ? "border-orange-500 bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/40"
                            : "border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-gray-800/50"
                        }`}
                      >
                        Day {d}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1.5">
                    US: NOAA SPC (selected day) · Europe: MesoCast (selected day) + active thunderstorm warnings
                  </p>
                </div>

                <div className="mb-4">
                  <label className="text-sm text-gray-300 mb-2 block">ESSL outlook</label>
                  <div className="space-y-2">
                    {Object.entries(ESSL_OUTLOOK_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => onChange({ weatherRiskType: key as EsslOutlookType })}
                        className={`w-full text-left py-2 rounded-lg border text-sm font-medium transition-all ${
                          weatherRiskType === key
                            ? "border-blue-500 bg-blue-500/10 text-blue-200 ring-1 ring-blue-500/30"
                            : "border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-gray-800/50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-gray-300">Overlay opacity</label>
                    <span className="text-xs text-orange-400 font-mono">{Math.round(weatherRiskOpacity * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-7">Light</span>
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.05}
                      value={weatherRiskOpacity}
                      onChange={(e) => onChange({ weatherRiskOpacity: Number(e.target.value) })}
                      className="flex-1 accent-orange-500 h-1.5"
                    />
                    <span className="text-xs text-gray-500 w-7">Solid</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800">
                  <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-widest font-medium">United States (SPC)</p>
                  <div className="space-y-1 mb-3">
                    {SPC_RISK_LEGEND.map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span
                          className="w-4 h-2.5 rounded-sm border flex-shrink-0"
                          style={{ backgroundColor: item.fill, borderColor: item.stroke }}
                        />
                        <span className="text-xs text-gray-400">
                          <span className="font-mono text-gray-300">{item.label}</span>
                          {" · "}{item.name}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-widest font-medium">Europe (MesoCast)</p>
                  <div className="space-y-1">
                    {MESOCAST_RISK_LEGEND.map((item) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <span
                          className="w-4 h-2.5 rounded-sm border flex-shrink-0"
                          style={{ backgroundColor: item.fill, borderColor: item.stroke }}
                        />
                        <span className="text-xs text-gray-400">
                          <span className="font-mono text-gray-300">{item.label}</span>
                          {" · "}{item.name}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-2">
                    Dashed polygons: active European thunderstorm warnings (MeteoAlarm via IFRC)
                  </p>
                </div>
              </>
            )}
          </section>

          {/* ── Warnings & Watches ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-3">
              Warnings &amp; Watches
            </h3>

            <button
              onClick={() => onChange({ weatherAlertsEnabled: !weatherAlertsEnabled })}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all mb-4 ${
                weatherAlertsEnabled
                  ? "border-red-500/60 bg-red-500/10 text-red-200"
                  : "border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-gray-800/50"
              }`}
            >
              <span className="text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Overlay active alerts
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                weatherAlertsEnabled ? "bg-red-500/30 text-red-200" : "bg-gray-800 text-gray-500"
              }`}>
                {weatherAlertsEnabled ? "ON" : "OFF"}
              </span>
            </button>

            {weatherAlertsEnabled && (
              <>
                <p className="text-[10px] text-gray-600 mb-4 leading-relaxed">
                  Global government-issued weather warnings and watches (CAP alerts via IFRC Alert Hub).
                </p>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-gray-300">Overlay opacity</label>
                    <span className="text-xs text-red-400 font-mono">{Math.round(weatherAlertsOpacity * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-7">Light</span>
                    <input
                      type="range"
                      min={0.2}
                      max={1}
                      step={0.05}
                      value={weatherAlertsOpacity}
                      onChange={(e) => onChange({ weatherAlertsOpacity: Number(e.target.value) })}
                      className="flex-1 accent-red-500 h-1.5"
                    />
                    <span className="text-xs text-gray-500 w-7">Solid</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800">
                  <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-widest font-medium">By severity</p>
                  <div className="space-y-1">
                    {ALERT_SEVERITY_LEGEND.map((item) => (
                      <div key={item.key} className="flex items-center gap-2">
                        <span
                          className="w-4 h-2.5 rounded-sm border flex-shrink-0"
                          style={{ backgroundColor: item.fill, borderColor: item.stroke }}
                        />
                        <span className="text-xs text-gray-400">{item.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-2">
                    Dashed borders = watches · solid = warnings/advisories
                  </p>
                </div>
              </>
            )}
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
  station, product, products, tilts, selectedTilt, onProductChange, onTiltChange, onClose,
}: {
  station: RadarStation;
  product: RadarProduct;
  products: RadarProduct[];
  tilts: RadarTilt[];
  selectedTilt: number;
  onProductChange: (p: RadarProduct) => void;
  onTiltChange: (tilt: number) => void;
  onClose: () => void;
}) {
  const flag = COUNTRY_FLAGS[station.countryCode] ?? "📡";
  const hasProducts = products.length > 0;

  return (
    <div className="absolute bottom-20 sm:bottom-auto sm:top-2 left-2 right-2 sm:left-auto sm:right-2 z-[500] bg-gray-900/95 backdrop-blur border border-gray-700 rounded-xl shadow-2xl sm:w-64 overflow-hidden pointer-events-auto">
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
        {hasProducts && productSupportsTilt(product) && tilts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Tilt</p>
            <div className="grid grid-cols-4 gap-1.5">
              {tilts.map((t) => (
                <button
                  key={t.index}
                  onClick={() => onTiltChange(t.index)}
                  title={t.description}
                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    selectedTilt === t.index
                      ? "bg-blue-600/30 border-blue-500/60 text-blue-300"
                      : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
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

function alertKindLabel(kind: WeatherAlertRecord["kind"]): string {
  if (kind === "watch") return "Watch";
  if (kind === "warning") return "Warning";
  if (kind === "advisory") return "Advisory";
  return "Alert";
}

function AlertDetailPanel({
  alert, onClose,
}: {
  alert: WeatherAlertRecord;
  onClose: () => void;
}) {
  const severity = ALERT_SEVERITY_LEGEND.find((r) => r.key === alert.severity);
  const expires = formatAlertExpiry(alert.expires);

  return (
    <div className="absolute bottom-20 sm:bottom-auto sm:top-2 left-2 right-2 sm:left-auto sm:right-2 z-[500] bg-gray-900/95 backdrop-blur border border-gray-700 rounded-xl shadow-2xl sm:w-80 max-h-[70vh] sm:max-h-[calc(100%-1rem)] overflow-hidden flex flex-col pointer-events-auto">
      <div className="flex items-start justify-between p-3 border-b border-gray-800 flex-shrink-0">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="w-2.5 h-2.5 rounded-sm border flex-shrink-0"
              style={{ backgroundColor: severity?.fill, borderColor: severity?.stroke }}
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-red-400">
              {alertKindLabel(alert.kind)}
            </span>
            {severity && (
              <span className="text-xs text-gray-500">{severity.label}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-white mt-1 leading-tight">{alert.headline}</p>
          <p className="text-xs text-gray-400 mt-1">
            {[alert.area, alert.country].filter(Boolean).join(" · ")}
          </p>
          {expires && (
            <p className="text-xs text-gray-500 mt-0.5">Until {expires}</p>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white p-1 -mt-1 -mr-1 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 overflow-y-auto flex-1">
        {alert.description ? (
          <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{alert.description}</p>
        ) : (
          <p className="text-xs text-gray-500 italic">No detailed description available for this alert.</p>
        )}
        <p className="text-[10px] text-gray-600 mt-3 pt-2 border-t border-gray-800">
          Source: {alert.source}
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
const GLOBAL_CENTER: [number, number] = [48, -18];
const GLOBAL_ZOOM = 3;

type SplitLayout = "single" | "2v" | "2h" | "quad";
const SPLIT_CYCLE: SplitLayout[] = ["single", "2v", "2h", "quad"];
const DEFAULT_PANE_PRODUCTS = ["N0Q", "N0U", "N0C", "N0X"];

function paneCount(layout: SplitLayout): number {
  if (layout === "single") return 1;
  if (layout === "quad") return 4;
  return 2;
}

const DEFAULT_SETTINGS: AppSettings = {
  animSpeed: 600,
  globalFrameLimit: DEFAULT_RADAR_FRAME_LIMIT,
  stationFrameLimit: DEFAULT_RADAR_FRAME_LIMIT,
  colorScheme: -1,
  customStops: DEFAULT_CUSTOM_STOPS,
  reflectivityFadeStartDbz: 0,
  reflectivityFadeEndDbz: 10,
  lightningSize: 1,
  lightningMaxAge: 15,
  weatherRiskEnabled: false,
  weatherRiskDay: 1,
  weatherRiskType: "paramcombi24",
  weatherRiskOpacity: 0.75,
  weatherAlertsEnabled: false,
  weatherAlertsOpacity: 0.7,
  satelliteProduct: "auto",
};

export default function RadarPage() {
  const [mode, setMode]                 = useState<"overview" | "station" | "alerts" | "models">("overview");
  const [frameIndex, setFrameIndex]     = useState(0);
  const [playing, setPlaying]           = useState(true);
  const [opacity, setOpacity]           = useState(0.8);
  const [loading, setLoading]           = useState(true);
  const [mapType, setMapType]           = useState<"dark" | "satellite">("dark");
  const [selectedStation, setSelectedStation] = useState<RadarStation | null>(null);
  const [selectedProduct, setSelectedProduct] = useState(STATION_RADAR_PRODUCTS[0]);
  const [selectedTilt, setSelectedTilt] = useState(0);
  const [lightningEnabled, setLightningEnabled] = useState(false);
  const [satelliteOverlayEnabled, setSatelliteOverlayEnabled] = useState(false);
  const [globalRadarEnabled, setGlobalRadarEnabled] = useState(true);
  const [stationSearch, setStationSearch] = useState("");
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(true);
  const [alertSearch, setAlertSearch] = useState("");
  const [alertFilterKind, setAlertFilterKind] = useState<"all" | "warning" | "watch" | "advisory">("all");
  const [selectedAlert, setSelectedAlert] = useState<WeatherAlertRecord | null>(null);
  const [mapZoom, setMapZoom]           = useState(GLOBAL_ZOOM);
  const [panelOpen, setPanelOpen]       = useState(true);
  const [stationDetailPanelOpen, setStationDetailPanelOpen] = useState(true);
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
  const [modelVariableId, setModelVariableId] = useState<ModelVariableId>("precipitation");
  const [modelPressureLevel, setModelPressureLevel] = useState("surface");
  const [modelHourIndex, setModelHourIndex] = useState(0);
  const [modelPlaying, setModelPlaying] = useState(true);
  const [modelOpacity, setModelOpacity] = useState(0.85);
  const [modelBounds, setModelBounds] = useState<MapBounds | null>(null);
  const [altitudeOpen, setAltitudeOpen] = useState(false);
  const [crossSectionMode, setCrossSectionMode] = useState(false);
  const [crossSectionStart, setCrossSectionStart] = useState<LatLng | null>(null);
  const [crossSectionEnd, setCrossSectionEnd] = useState<LatLng | null>(null);
  const [probeMode, setProbeMode] = useState(false);
  const [probePoint, setProbePoint] = useState<LatLng | null>(null);
  const [probeResult, setProbeResult] = useState<PixelProbeResult | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);
  const [rhiPanelOpen, setRhiPanelOpen] = useState(false);
  const [splitLayout, setSplitLayout] = useState<SplitLayout>("single");
  const [paneProducts, setPaneProducts] = useState<string[]>(DEFAULT_PANE_PRODUCTS);
  const [mapView, setMapView] = useState<MapViewState>({
    lat: GLOBAL_CENTER[0],
    lon: GLOBAL_CENTER[1],
    zoom: GLOBAL_ZOOM,
  });
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modelPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveEdgeRef = useRef(true);
  const prevLastScanTimeRef = useRef<number | null>(null);
  const probeSeqRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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

  useEffect(() => {
    if (!probeMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProbeMode(false);
        setProbePoint(null);
        setProbeResult(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [probeMode]);

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

  const { frames: globalFrames, loading: globalFramesLoading } = useGlobalRadarFrames();

  const displayFrames = useMemo(
    () => sliceRecentGlobalFrames(globalFrames, settings.globalFrameLimit),
    [globalFrames, settings.globalFrameLimit],
  );

  useEffect(() => {
    if (!globalFramesLoading) setLoading(false);
  }, [globalFramesLoading]);

  const { stations: usStations, loading: usLoading } = useNWSStations();
  const stationForHooks = mode === "station" ? selectedStation : null;
  const { frames: stationFrames, loading: stationFramesLoading } = useStationRadarFrames(
    stationForHooks,
    selectedProduct.id,
    selectedTilt,
    settings.stationFrameLimit,
  );
  const { frames: level3Frames, loading: level3Loading } = useLevel3RadarFrames(
    stationForHooks,
    selectedProduct.id,
    selectedTilt,
    settings.stationFrameLimit,
  );
  const { frames: operaFrames, loading: operaLoading, hasOpera } = useOperaRadarFrames(
    stationForHooks,
    selectedProduct.id,
    selectedTilt,
    settings.stationFrameLimit,
  );
  const strikes = useLightning(lightningEnabled);
  const { outlook: weatherRiskOutlook, loading: weatherRiskLoading, error: weatherRiskError } =
    useWeatherRiskOutlook(settings.weatherRiskEnabled, settings.weatherRiskDay);
  const { imageUrl: esslOutlookImageUrl, loading: esslOutlookLoading, error: esslOutlookError } =
    useEsslOutlookImage(settings.weatherRiskEnabled, settings.weatherRiskType);
  const { data: weatherAlerts, loading: weatherAlertsLoading, error: weatherAlertsError } =
    useWeatherAlerts(settings.weatherAlertsEnabled || mode === "alerts");

  const modelsActive = mode === "models";
  const activeModelVariable = modelVariable(modelVariableId);
  const { times: modelTimes, loading: modelTimesLoading } = useEcmwfTimeline(modelsActive);
  const { grid: modelGrid, loading: modelGridLoading, error: modelGridError } = useEcmwfGrid(
    modelsActive,
    modelBounds,
    mapZoom,
    modelVariableId,
    modelPressureLevel,
  );

  const stationProductList = useMemo(
    () => (selectedStation ? stationProductsFor(selectedStation) : []),
    [selectedStation],
  );

  const dataSource = selectedStation
    ? resolveStationDataSource(selectedProduct.id, selectedStation.country, selectedTilt)
    : null;

  const stationTilts = useMemo(
    () => (selectedStation ? tiltsForCountry(selectedStation.country) : []),
    [selectedStation],
  );

  const activeTiltLabel = stationTilts.find((t) => t.index === selectedTilt)?.label;

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

  const visibleAlerts = useMemo(() => {
    const list = weatherAlerts?.alerts ?? [];
    const q = alertSearch.trim().toLowerCase();
    const severityRank: Record<string, number> = {
      EXTREME: 0, SEVERE: 1, MODERATE: 2, MINOR: 3, UNKNOWN: 4,
    };
    return list
      .filter((a) => {
        if (alertFilterKind !== "all" && a.kind !== alertFilterKind) return false;
        if (!q) return true;
        return (
          a.event.toLowerCase().includes(q)
          || a.headline.toLowerCase().includes(q)
          || a.description.toLowerCase().includes(q)
          || (a.area ?? "").toLowerCase().includes(q)
          || (a.country ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const sd = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
        if (sd !== 0) return sd;
        return a.headline.localeCompare(b.headline);
      });
  }, [weatherAlerts?.alerts, alertSearch, alertFilterKind]);

  const ALERT_FILTER_GROUPS = [
    { id: "all", label: "All" },
    { id: "warning", label: "Warnings" },
    { id: "watch", label: "Watches" },
    { id: "advisory", label: "Advisories" },
  ] as const;

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

  const crossSectionDisplayStart = useMemo(() => {
    if (mode === "station" && selectedStation) {
      return { lat: selectedStation.lat, lon: selectedStation.lon };
    }
    return crossSectionStart;
  }, [mode, selectedStation, crossSectionStart]);

  const crossSectionSlice = useMemo(() => {
    if (mode === "station" && selectedStation && crossSectionEnd) {
      return anchorRadarSliceAtStation(
        { lat: selectedStation.lat, lon: selectedStation.lon },
        crossSectionEnd,
      );
    }
    if (crossSectionStart && crossSectionEnd) {
      return { start: crossSectionStart, end: crossSectionEnd };
    }
    return null;
  }, [mode, selectedStation, crossSectionStart, crossSectionEnd]);

  const { result: crossSectionResult, loading: crossSectionLoading, error: crossSectionError } =
    useCrossSectionData({
      enabled: rhiPanelOpen && !!crossSectionSlice,
      kind: mode === "models" ? "ecmwf" : "radar",
      start: crossSectionSlice?.start ?? null,
      end: crossSectionSlice?.end ?? null,
      modelHourIndex,
      radar:
        mode === "station" && selectedStation
          ? {
              station: selectedStation,
              productId: selectedProduct.id,
              dataSource,
              frameTime: timelineFrames[frameIndex]?.time,
              iemTmsId: stationFrames[frameIndex]?.tmsId ?? stationFrames.at(-1)?.tmsId,
              level3FrameKey:
                level3Frames[frameIndex]?.key ?? level3Frames.at(-1)?.key,
            }
          : undefined,
    });

  // Jump to latest scan when station/product changes or frames finish loading
  useEffect(() => {
    if (mode === "station" && activeStationFrames.length > 0) {
      setFrameIndex(activeStationFrames.length - 1);
      setPlaying(true);
    }
    prevLastScanTimeRef.current = null;
  }, [selectedStation?.id, selectedProduct.id, selectedTilt, mode, activeStationFrames.length]);

  // Track whether the user is viewing the latest scan
  useEffect(() => {
    if (timelineFrames.length === 0) {
      liveEdgeRef.current = true;
      return;
    }
    liveEdgeRef.current = frameIndex >= timelineFrames.length - 1;
  }, [frameIndex, timelineFrames.length]);

  // Advance to newest scan when fresh data arrives and user was on the live edge
  useEffect(() => {
    if (timelineFrames.length === 0) return;
    const lastTime = timelineFrames[timelineFrames.length - 1].time;
    const prev = prevLastScanTimeRef.current;
    prevLastScanTimeRef.current = lastTime;
    if (prev !== null && lastTime > prev && liveEdgeRef.current) {
      setFrameIndex(timelineFrames.length - 1);
    }
  }, [timelineFrames]);

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
    if (selectedStation?.id === station.id) {
      setStationDetailPanelOpen(true);
      return;
    }
    const list = stationProductsFor(station);
    if (list.length > 0 && !list.some((p) => p.id === selectedProduct.id)) {
      setSelectedProduct(list[0]);
    }
    setSelectedStation(station);
    setStationDetailPanelOpen(true);
    setStationRadarStatus("loading");
  }, [selectedProduct.id, selectedStation?.id]);

  const handleSelectAlert = useCallback((alert: WeatherAlertRecord) => {
    setSelectedAlert(alert);
    if (isMobile) setAlertsPanelOpen(false);
  }, [isMobile]);

  // Auto-play model forecast hours
  useEffect(() => {
    if (!modelsActive || !modelPlaying || modelTimes.length === 0) return;
    modelPlayRef.current = setInterval(
      () => setModelHourIndex((i) => (i + 1) % modelTimes.length),
      Math.max(settings.animSpeed, 1200),
    );
    return () => { if (modelPlayRef.current) clearInterval(modelPlayRef.current); };
  }, [modelsActive, modelPlaying, modelTimes.length, settings.animSpeed]);

  useEffect(() => {
    if (modelTimes.length > 0 && modelHourIndex >= modelTimes.length) {
      setModelHourIndex(modelTimes.length - 1);
    }
  }, [modelTimes.length, modelHourIndex]);

  const handleEnterModelsMode = useCallback(() => {
    setMode("models");
    setSelectedAlert(null);
    setModelPlaying(true);
    setPlaying(false);
  }, []);

  const handleCrossSectionPoint = useCallback((point: LatLng) => {
    if (mode === "station" && selectedStation) {
      setCrossSectionStart({ lat: selectedStation.lat, lon: selectedStation.lon });
      setCrossSectionEnd(point);
      setRhiPanelOpen(true);
      return;
    }
    if (!crossSectionStart || (crossSectionStart && crossSectionEnd)) {
      setCrossSectionStart(point);
      setCrossSectionEnd(null);
      setRhiPanelOpen(true);
      return;
    }
    setCrossSectionEnd(point);
  }, [mode, selectedStation, crossSectionStart, crossSectionEnd]);

  useEffect(() => {
    if (mode === "station" && selectedStation && crossSectionMode) {
      setCrossSectionStart({ lat: selectedStation.lat, lon: selectedStation.lon });
    }
  }, [selectedStation?.id, selectedStation?.lat, selectedStation?.lon, mode, crossSectionMode]);

  useEffect(() => {
    if (selectedStation) {
      setMapView((v) => ({
        ...v,
        lat: selectedStation.lat,
        lon: selectedStation.lon,
        zoom: Math.max(v.zoom, 8),
      }));
    }
  }, [selectedStation?.id, selectedStation?.lat, selectedStation?.lon]);

  const cycleSplitLayout = useCallback(() => {
    setSplitLayout((cur) => {
      const idx = SPLIT_CYCLE.indexOf(cur);
      return SPLIT_CYCLE[(idx + 1) % SPLIT_CYCLE.length];
    });
  }, []);

  const handlePaneProductChange = useCallback((paneIndex: number, productId: string) => {
    setPaneProducts((prev) => {
      const next = [...prev];
      next[paneIndex] = productId;
      return next;
    });
    if (paneIndex === 0) {
      const product = getRadarProduct(productId);
      if (product) setSelectedProduct(product);
    }
  }, []);

  const splitViewActive = mode === "station" && !!selectedStation && splitLayout !== "single";
  const probeAvailable = mode !== "models" && !splitViewActive;
  const crossSectionAvailable = mode === "station" || mode === "models";
  const splitViewAvailable = mode === "station" && !!selectedStation;

  useEffect(() => {
    if (mode !== "station") setSplitLayout("single");
  }, [mode]);

  useEffect(() => {
    if (splitViewActive && probeMode) {
      setProbeMode(false);
      setProbePoint(null);
      setProbeResult(null);
    }
  }, [splitViewActive, probeMode]);

  useEffect(() => {
    setPaneProducts((prev) => {
      const next = [...prev];
      next[0] = selectedProduct.id;
      return next;
    });
  }, [selectedProduct.id]);

  useEffect(() => {
    if (!activeModelVariable.supportsPressure && modelPressureLevel !== "surface") {
      setModelPressureLevel("surface");
    }
  }, [modelVariableId, activeModelVariable.supportsPressure, modelPressureLevel]);

  const toggleCrossSectionTool = useCallback(() => {
    setCrossSectionMode((v) => {
      const next = !v;
      if (!next) {
        setCrossSectionStart(null);
        setCrossSectionEnd(null);
        setRhiPanelOpen(false);
      } else {
        setDrawMode(false);
        setProbeMode(false);
        setProbePoint(null);
        setProbeResult(null);
        if (mode === "station" && selectedStation) {
          setCrossSectionStart({ lat: selectedStation.lat, lon: selectedStation.lon });
          setCrossSectionEnd(null);
        }
      }
      return next;
    });
  }, [mode, selectedStation]);

  const toggleProbeTool = useCallback(() => {
    setProbeMode((v) => {
      const next = !v;
      if (!next) {
        setProbePoint(null);
        setProbeResult(null);
      } else {
        setDrawMode(false);
        setCrossSectionMode(false);
        setCrossSectionStart(null);
        setCrossSectionEnd(null);
        setRhiPanelOpen(false);
      }
      return next;
    });
  }, []);

  const probeContext = useMemo((): PixelProbeContext => {
    const frame = timelineFrames[frameIndex];
    const ctx: PixelProbeContext = {
      mode,
      mapZoom,
      frameTime: frame?.time,
    };

    if (mode === "overview" || mode === "alerts") {
      const gFrame = displayFrames[Math.min(frameIndex, displayFrames.length - 1)];
      if (gFrame && globalRadarEnabled) {
        if (gFrame.rainViewerPath) ctx.rainViewerFramePath = gFrame.rainViewerPath;
        else if (gFrame.iemTmsId) ctx.iemTmsId = gFrame.iemTmsId;
      }
    } else if (mode === "station" && selectedStation) {
      ctx.product = selectedProduct;
      ctx.dataSource = dataSource;
      ctx.stationId = selectedStation.id;
      ctx.stationLat = selectedStation.lat;
      ctx.stationLon = selectedStation.lon;
      if (dataSource === "iem") {
        ctx.iemTmsId = stationFrames[frameIndex]?.tmsId ?? stationFrames.at(-1)?.tmsId;
      } else if (dataSource === "level3") {
        ctx.level3FrameKey = level3Frames[frameIndex]?.key ?? level3Frames.at(-1)?.key;
      } else if (dataSource === "opera") {
        ctx.operaOdimUrl = operaFrames[frameIndex]?.odimUrl ?? operaFrames.at(-1)?.odimUrl;
      }
    }

    return ctx;
  }, [
    mode,
    mapZoom,
    timelineFrames,
    frameIndex,
    displayFrames,
    globalRadarEnabled,
    selectedStation,
    selectedProduct,
    dataSource,
    stationFrames,
    level3Frames,
    operaFrames,
  ]);

  const runProbe = useCallback(
    async (point: LatLng) => {
      const seq = ++probeSeqRef.current;
      setProbeLoading(true);
      try {
        const result = await probeRadarPixel(probeContext, point.lat, point.lon);
        if (seq !== probeSeqRef.current) return;
        setProbeResult(result);
      } finally {
        if (seq === probeSeqRef.current) setProbeLoading(false);
      }
    },
    [probeContext],
  );

  const handleProbePoint = useCallback((point: LatLng | null) => {
    setProbePoint(point);
    if (!point) {
      probeSeqRef.current += 1;
      setProbeLoading(false);
      setProbeResult(null);
    }
  }, []);

  useEffect(() => {
    if (!probePoint || !probeMode) return;
    const timer = setTimeout(() => void runProbe(probePoint), 75);
    return () => clearTimeout(timer);
  }, [probePoint, probeMode, runProbe]);

  useEffect(() => {
    if (mode === "models") {
      setProbeMode(false);
      setProbePoint(null);
      setProbeResult(null);
    }
  }, [mode]);

  useEffect(() => {
    return () => clearLevel3ProbeCache();
  }, [selectedProduct.id, selectedStation?.id]);

  const handleEnterAlertsMode = useCallback(() => {
    setMode("alerts");
    setSelectedAlert(null);
    setAlertsPanelOpen(true);
    if (!settings.weatherAlertsEnabled) {
      patchSettings({ weatherAlertsEnabled: true });
    }
  }, [settings.weatherAlertsEnabled, patchSettings]);

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
        ? stationFramesLoading && stationFrames.length === 0
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
    selectedTilt,
    dataSource,
    hasOpera,
    activeStationFrames.length,
    stationFramesLoading,
    level3Loading,
    operaLoading,
  ]);

  const handleProductChange = useCallback((product: RadarProduct) => {
    setSelectedProduct(product);
    if (!productSupportsTilt(product)) setSelectedTilt(0);
    setStationRadarStatus("loading");
  }, []);

  const handleTiltChange = useCallback((tilt: number) => {
    setSelectedTilt(tilt);
    setStationRadarStatus("loading");
  }, []);

  const showSatelliteOverlay =
    satelliteOverlayEnabled && mode !== "models";

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
        ? "Default"
        : currentColorScheme.label;
  const legendMin =
    mode === "station" ? (selectedProduct.legendMin ?? "Light") : "Light";
  const legendMax =
    mode === "station" ? (selectedProduct.legendMax ?? "Heavy") : "Heavy";

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="relative flex flex-wrap items-center gap-1.5 sm:gap-2 px-3 py-2 bg-gray-900 border-b border-gray-800 z-[1000] flex-shrink-0">
        {/* Logo + mode toggle row (always visible) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Cloud className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <span className="font-bold tracking-tight hidden sm:block">CloudScan</span>
        </div>
        <div className="w-px h-5 bg-gray-700 mx-1 hidden sm:block" />

        {/* Mode toggle */}
        <div className="flex gap-0.5 bg-gray-800 rounded-lg p-1">
          <button onClick={() => { setMode("overview"); setSelectedAlert(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-md text-sm font-medium transition-all ${mode === "overview" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
            <Map className="w-3.5 h-3.5" /><span>Global</span>
          </button>
          <button onClick={() => { setMode("station"); setSelectedAlert(null); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-md text-sm font-medium transition-all ${mode === "station" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
            <Radio className="w-3.5 h-3.5" /><span>Station</span>
          </button>
          <button onClick={handleEnterAlertsMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-md text-sm font-medium transition-all ${mode === "alerts" ? "bg-red-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
            <ShieldAlert className="w-3.5 h-3.5" /><span>Alerts</span>
          </button>
          <button onClick={handleEnterModelsMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-md text-sm font-medium transition-all ${mode === "models" ? "bg-orange-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"}`}>
            <Globe2 className="w-3.5 h-3.5" /><span className="hidden md:inline">Weather Models</span><span className="md:hidden">Models</span>
          </button>
        </div>

        {/* Lightning toggle */}
        <button onClick={() => setLightningEnabled(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-sm font-medium border transition-all ${lightningEnabled ? "bg-yellow-500/20 border-yellow-500/60 text-yellow-300" : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"}`}>
          <Zap className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Lightning</span>
          {lightningEnabled && strikes.length > 0 && (
            <span className="bg-yellow-500/30 text-yellow-300 text-xs px-1.5 rounded-full">{strikes.length.toLocaleString()}</span>
          )}
        </button>

        {/* Satellite underlay (GOES visible + radar on top) */}
        <button
          onClick={() => setSatelliteOverlayEnabled(v => !v)}
          disabled={mode === "models"}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-sm font-medium border transition-all ${
            satelliteOverlayEnabled
              ? "bg-sky-500/20 border-sky-500/60 text-sky-300"
              : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
          } ${mode === "models" ? "opacity-40 pointer-events-none" : ""}`}
        >
          <Satellite className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Satellite</span>
        </button>

        {/* Global radar composite toggle */}
        {(mode === "overview" || mode === "alerts") && (
          <button
            onClick={() => setGlobalRadarEnabled(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-sm font-medium border transition-all ${
              globalRadarEnabled
                ? "bg-blue-500/20 border-blue-500/60 text-blue-300"
                : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
          >
            <CloudRain className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Radar</span>
          </button>
        )}

        {/* Map type */}
        <button onClick={() => setMapType(t => t === "dark" ? "satellite" : "dark")}
          title={mapType === "dark" ? "Switch to satellite basemap" : "Switch to dark basemap"}
          className="flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-700 transition-all">
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Map</span>
        </button>

        {/* Draw */}
        <button
          onClick={() => setDrawMode(v => !v)}
          disabled={mode === "models" || crossSectionMode || probeMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-sm border transition-all ${
            drawMode
              ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
              : "text-gray-400 hover:text-white hover:bg-gray-800 border-gray-700"
          } ${mode === "models" || crossSectionMode || probeMode ? "opacity-40 pointer-events-none" : ""}`}
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Draw</span>
        </button>

        <button
          onClick={toggleProbeTool}
          disabled={!probeAvailable}
          title={
            probeAvailable
              ? "Move cursor over the map to inspect radar values"
              : "Pixel probe is unavailable in split view or Weather Models mode"
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-sm border transition-all ${
            probeMode
              ? "bg-cyan-500/20 border-cyan-500/60 text-cyan-300"
              : "text-gray-400 hover:text-white hover:bg-gray-800 border-gray-700"
          } ${!probeAvailable ? "opacity-40 pointer-events-none" : ""}`}
        >
          <Crosshair className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Probe</span>
        </button>

        <button
          onClick={toggleCrossSectionTool}
          disabled={!crossSectionAvailable}
          title={
            crossSectionAvailable
              ? "Draw a line for a vertical radar slice (RHI)"
              : "Cross-section requires Station or Weather Models mode"
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-sm border transition-all ${
            crossSectionMode
              ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
              : "text-gray-400 hover:text-white hover:bg-gray-800 border-gray-700"
          } ${!crossSectionAvailable ? "opacity-40 pointer-events-none" : ""}`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Cross-section</span>
        </button>
        <button
          onClick={cycleSplitLayout}
          disabled={!splitViewAvailable}
          title={
            splitViewAvailable
              ? `Split view: ${splitLayout === "single" ? "single pane" : splitLayout === "2v" ? "2 columns" : splitLayout === "2h" ? "2 rows" : "4 panes"}`
              : "Split view requires a selected station"
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-sm border transition-all ${
            splitLayout !== "single"
              ? "bg-blue-500/20 border-blue-500/60 text-blue-300"
              : "text-gray-400 hover:text-white hover:bg-gray-800 border-gray-700"
          } ${!splitViewAvailable ? "opacity-40 pointer-events-none" : ""}`}
        >
          <LayoutPanelTop className="w-3.5 h-3.5" />
          <span className="hidden sm:block">
            {splitLayout === "single" ? "Split view" : splitLayout === "2v" ? "2 cols" : splitLayout === "2h" ? "2 rows" : "4 panes"}
          </span>
        </button>

        {/* Settings */}
        <button onClick={() => setSettingsOpen(v => !v)}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-lg text-sm border transition-all ${settingsOpen ? "bg-gray-700 border-gray-500 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800 border-gray-700"}`}>
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Settings</span>
        </button>

        {/* Per-station product menu — wraps to new row on mobile */}
        {mode === "station" && selectedStation && stationProductList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
            <div className="flex gap-0.5 bg-gray-800 rounded-lg p-1 border border-gray-700 overflow-x-auto">
              {stationProductList.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProductChange(p)}
                  title={p.description}
                  className={`px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs font-semibold transition-all flex-shrink-0 ${
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
            {productSupportsTilt(selectedProduct) && stationTilts.length > 0 && (
              <div className="flex gap-0.5 bg-gray-800 rounded-lg p-1 border border-gray-700 overflow-x-auto">
                {stationTilts.map((t) => (
                  <button
                    key={t.index}
                    onClick={() => handleTiltChange(t.index)}
                    title={t.description}
                    className={`px-2.5 py-1.5 sm:px-2 sm:py-1 rounded-md text-xs font-semibold transition-all flex-shrink-0 ${
                      selectedTilt === t.index
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-400 hover:text-white hover:bg-gray-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Settings drawer (rendered outside body flow, fixed) */}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onChange={patchSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* ─── Body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Station side panel — left sidebar on desktop, bottom sheet on mobile */}
        {mode === "station" && panelOpen && (
          <>
            {/* Mobile backdrop */}
            {isMobile && (
              <div className="fixed inset-0 z-[900] bg-black/50 sm:hidden" onClick={() => setPanelOpen(false)} />
            )}
            <div className={
              isMobile
                ? "fixed bottom-0 left-0 right-0 z-[1000] bg-gray-900 border-t border-gray-800 flex flex-col rounded-t-2xl shadow-2xl"
                : "relative z-[1000] w-60 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col"
            } style={isMobile ? { maxHeight: "60vh" } : {}}>
              {/* Mobile drag handle */}
              {isMobile && (
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-400" /> Radar Stations
                  </span>
                  <button onClick={() => setPanelOpen(false)} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="p-2 border-b border-gray-800 flex flex-wrap gap-1">
                {COUNTRY_GROUPS.map(g => (
                  <button key={g.id} onClick={() => setFilterCountry(g.id)}
                    className={`px-2.5 py-1 sm:px-2 sm:py-0.5 rounded text-xs font-medium transition-all ${filterCountry === g.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700"}`}>
                    {g.label}
                  </button>
                ))}
              </div>
              <div className="p-2 border-b border-gray-800">
                <input type="text" placeholder="Search stations…"
                  value={stationSearch} onChange={e => setStationSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 sm:py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition-colors" />
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
                    <button key={s.id} onClick={() => { handleSelectStation(s); if (isMobile) setPanelOpen(false); }}
                      title={stationSupportHint(s)}
                      className={`w-full text-left px-3 py-3 sm:py-2 border-b border-gray-800/50 transition-colors flex items-start gap-2 ${
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
              {!isMobile && (
                <button onClick={() => setPanelOpen(false)}
                  className="p-2 text-xs text-gray-500 hover:text-white border-t border-gray-800 transition-colors text-center">
                  Hide panel
                </button>
              )}
            </div>
          </>
        )}

        {/* Alerts side panel — same layout as station panel */}
        {mode === "alerts" && alertsPanelOpen && (
          <>
            {isMobile && (
              <div className="fixed inset-0 z-[900] bg-black/50 sm:hidden" onClick={() => setAlertsPanelOpen(false)} />
            )}
            <div className={
              isMobile
                ? "fixed bottom-0 left-0 right-0 z-[1000] bg-gray-900 border-t border-gray-800 flex flex-col rounded-t-2xl shadow-2xl"
                : "relative z-[1000] w-60 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col"
            } style={isMobile ? { maxHeight: "60vh" } : {}}>
              {isMobile && (
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
                  <span className="text-sm font-semibold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-400" /> Weather Alerts
                  </span>
                  <button onClick={() => setAlertsPanelOpen(false)} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="p-2 border-b border-gray-800 flex flex-wrap gap-1">
                {ALERT_FILTER_GROUPS.map((g) => (
                  <button key={g.id} onClick={() => setAlertFilterKind(g.id)}
                    className={`px-2.5 py-1 sm:px-2 sm:py-0.5 rounded text-xs font-medium transition-all ${alertFilterKind === g.id ? "bg-red-600 text-white" : "text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700"}`}>
                    {g.label}
                  </button>
                ))}
              </div>
              <div className="p-2 border-b border-gray-800">
                <input type="text" placeholder="Search alerts…"
                  value={alertSearch} onChange={e => setAlertSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 sm:py-1.5 text-sm text-white placeholder-gray-500 outline-none focus:border-red-500 transition-colors" />
              </div>
              <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-800">
                {weatherAlertsLoading
                  ? "Loading alerts…"
                  : `${visibleAlerts.length} alert${visibleAlerts.length === 1 ? "" : "s"}`}
              </div>
              <div className="flex-1 overflow-y-auto text-xs">
                {weatherAlertsError && (
                  <p className="px-3 py-3 text-red-400/90">{weatherAlertsError}</p>
                )}
                {!weatherAlertsLoading && !weatherAlertsError && visibleAlerts.length === 0 && (
                  <p className="px-3 py-3 text-gray-500">No active alerts match your search.</p>
                )}
                {visibleAlerts.map((a) => {
                  const isSelected = selectedAlert?.id === a.id;
                  return (
                    <button key={a.id} onClick={() => handleSelectAlert(a)}
                      className={`w-full text-left px-3 py-3 sm:py-2 border-b border-gray-800/50 transition-colors flex items-start gap-2 ${
                        isSelected
                          ? "bg-red-950/40 border-l-2 border-l-red-400"
                          : "hover:bg-gray-800"
                      }`}>
                      <span
                        className="w-2.5 h-2.5 rounded-sm border flex-shrink-0 mt-1"
                        style={{ backgroundColor: severityColor(a.severity), borderColor: severityColor(a.severity) }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`font-semibold leading-tight ${isSelected ? "text-red-200" : "text-gray-100"}`}>
                          {a.headline}
                        </div>
                        <div className="text-gray-400 truncate mt-0.5">
                          {[alertKindLabel(a.kind), a.area, a.country].filter(Boolean).join(" · ")}
                        </div>
                        {a.description && (
                          <div className="text-gray-500 mt-1 line-clamp-2 leading-snug">{a.description}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {!isMobile && (
                <button onClick={() => setAlertsPanelOpen(false)}
                  className="p-2 text-xs text-gray-500 hover:text-white border-t border-gray-800 transition-colors text-center">
                  Hide panel
                </button>
              )}
            </div>
          </>
        )}

        {/* Map area */}
        <PanelGroup
          direction="vertical"
          className="flex-1 flex flex-col min-w-0"
        >
          <Panel defaultSize={rhiPanelOpen ? 68 : 100} minSize={35}>
        <div className="h-full relative radar-map isolate">
          {loading && mode !== "models" && !splitViewActive && (
            <div className="absolute inset-0 z-[600] flex items-center justify-center bg-gray-950/80 backdrop-blur-sm pointer-events-auto">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-gray-400 text-sm">Loading radar data…</p>
              </div>
            </div>
          )}

          {mode === "station" && selectedStation && stationDetailPanelOpen && (
            <StationPanel
              station={selectedStation}
              product={selectedProduct}
              products={stationProductList}
              tilts={stationTilts}
              selectedTilt={selectedTilt}
              onProductChange={handleProductChange}
              onTiltChange={handleTiltChange}
              onClose={() => setStationDetailPanelOpen(false)}
            />
          )}

          {mode === "alerts" && selectedAlert && (
            <AlertDetailPanel
              alert={selectedAlert}
              onClose={() => setSelectedAlert(null)}
            />
          )}

          {mode === "station" && !panelOpen && (
            <button onClick={() => setPanelOpen(true)}
              className="absolute top-2 left-2 z-[500] flex items-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-xl text-sm text-gray-300 hover:text-white transition-colors pointer-events-auto">
              <Radio className="w-3.5 h-3.5 text-blue-400" />
              <span>Stations</span>
            </button>
          )}

          {mode === "alerts" && !alertsPanelOpen && (
            <button onClick={() => setAlertsPanelOpen(true)}
              className="absolute top-2 left-2 z-[500] flex items-center gap-1.5 px-3 py-2 sm:px-2.5 sm:py-1.5 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-xl text-sm text-gray-300 hover:text-white transition-colors pointer-events-auto">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              <span>Alerts</span>
            </button>
          )}

          {drawMode && (
            <div className={`absolute z-[500] pointer-events-none ${
              (mode === "station" && !panelOpen) || (mode === "alerts" && !alertsPanelOpen)
                ? "top-14 left-2"
                : "top-2 left-2"
            }`}>
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

          {splitViewActive && selectedStation ? (
            <div
              className={`absolute inset-0 z-[100] grid gap-px bg-gray-800 ${
                splitLayout === "2v"
                  ? "grid-cols-2 grid-rows-1"
                  : splitLayout === "2h"
                    ? "grid-cols-1 grid-rows-2"
                    : "grid-cols-2 grid-rows-2"
              }`}
            >
              {Array.from({ length: paneCount(splitLayout) }, (_, i) => (
                <RadarMapPane
                  key={i}
                  paneIndex={i}
                  productId={paneProducts[i] ?? DEFAULT_PANE_PRODUCTS[i] ?? "N0Q"}
                  tiltIndex={selectedTilt}
                  station={selectedStation}
                  frameIndex={frameIndex}
                  opacity={opacity}
                  mapType={mapType}
                  mapView={mapView}
                  onMapViewChange={setMapView}
                  syncInteractive={i === 0}
                  products={stationProductList}
                  onProductChange={handlePaneProductChange}
                  crossSectionMode={crossSectionMode}
                  crossSectionStart={crossSectionDisplayStart}
                  crossSectionEnd={crossSectionEnd}
                  onCrossSectionPoint={handleCrossSectionPoint}
                  customReflectivityStops={settings.customStops}
                  isCustomScale={isCustomScale}
                  reflectivityFadeStart={settings.reflectivityFadeStartDbz}
                  reflectivityFadeEnd={settings.reflectivityFadeEndDbz}
                  compact={splitLayout === "quad"}
                  satelliteOverlayEnabled={showSatelliteOverlay}
                  satelliteProduct={settings.satelliteProduct}
                  satelliteFrames={timelineFrames}
                  satelliteFrameIndex={frameIndex}
                  stationFrameLimit={settings.stationFrameLimit}
                />
              ))}
            </div>
          ) : null}

          <MapContainer center={GLOBAL_CENTER} zoom={GLOBAL_ZOOM}
            style={{ width: "100%", height: "100%", display: splitViewActive ? "none" : "block" }}
            zoomControl={true} attributionControl={false} worldCopyJump={false}
            maxBounds={MAP_MAX_BOUNDS} maxBoundsViscosity={1.0}>

            <TileLayer url={tileLayers[mapType]} noWrap />
            <MapViewportTracker onZoom={setMapZoom} />

            {showSatelliteOverlay && (
              <SatelliteOverlayLayer
                enabled
                opacity={1}
                product={settings.satelliteProduct}
                frames={timelineFrames}
                frameIndex={frameIndex}
              />
            )}

            {mode === "overview" || mode === "alerts" ? (
              globalRadarEnabled && displayFrames.length > 0 ? (
                <GlobalRadarLayer
                  frames={displayFrames}
                  frameIndex={frameIndex}
                  opacity={opacity}
                  isCustomScale={isCustomScale}
                  colorScheme={settings.colorScheme}
                  rainViewerLut={rainViewerLUT}
                  iemReflectivityLut={isCustomScale ? stationIemLUT : null}
                />
              ) : null
            ) : null}

            {mode === "models" && (
              <>
                <MapBoundsReporter
                  onBoundsChange={setModelBounds}
                  onZoomChange={setMapZoom}
                />
                <ModelFieldLayer
                  grid={modelGrid}
                  variableId={modelVariableId}
                  hourIndex={modelHourIndex}
                  opacity={modelOpacity}
                />
              </>
            )}

            {crossSectionMode && (
              <CrossSectionTool
                active={crossSectionMode}
                start={crossSectionDisplayStart}
                end={crossSectionEnd}
                onPoint={handleCrossSectionPoint}
              />
            )}

            {mode === "station"
              && crossSectionSlice
              && crossSectionResult?.kind === "rhi"
              && !crossSectionLoading && (
              <RhiCurtainOverlay
                start={crossSectionSlice.start}
                end={crossSectionSlice.end}
                data={crossSectionResult.data}
              />
            )}

            {probeMode && (
              <PixelProbeTool
                active={probeMode}
                point={probePoint}
                onPoint={handleProbePoint}
              />
            )}

            {mode === "station" && (
              <>
                <MapFlyTo station={selectedStation} instant />
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
                    tilt={selectedTilt}
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
                      reflectivity={isReflectivityFamily(selectedProduct.family)}
                      reflectivityFade={reflectivityFade}
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

            {mode === "alerts" && selectedAlert && (
              <MapFlyTo
                target={{ lat: selectedAlert.lat, lon: selectedAlert.lon }}
                zoom={8}
              />
            )}

            {settings.weatherRiskEnabled && weatherRiskOutlook && (
              <WeatherRiskLayer
                geojson={weatherRiskOutlook.geojson}
                opacity={settings.weatherRiskOpacity}
              />
            )}

            {settings.weatherRiskEnabled && esslOutlookImageUrl && (
              <EsslOutlookLayer
                imageUrl={esslOutlookImageUrl}
                opacity={settings.weatherRiskOpacity}
              />
            )}

            {settings.weatherAlertsEnabled && weatherAlerts && (
              <WeatherAlertsLayer
                geojson={weatherAlerts.geojson}
                opacity={settings.weatherAlertsOpacity}
                selectedRecordId={selectedAlert?.id ?? null}
              />
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

          {mode === "models" && (
            <>
              <ModelLayerSidebar active={modelVariableId} onSelect={setModelVariableId} />
              <div className="absolute bottom-28 sm:bottom-24 left-1/2 -translate-x-1/2 z-[600] flex items-end gap-3 pointer-events-none">
                {activeModelVariable.supportsPressure && (
                  <AltitudeSelector
                    open={altitudeOpen}
                    activeId={modelPressureLevel}
                    onToggle={() => setAltitudeOpen((v) => !v)}
                    onSelect={setModelPressureLevel}
                  />
                )}
              </div>
              {(modelGridLoading || modelGridError) && (
                <div className="absolute top-3 left-3 z-[600] bg-gray-900/90 backdrop-blur border border-gray-700 rounded-lg px-3 py-2 text-xs pointer-events-none">
                  {modelGridLoading && <span className="text-gray-400">Loading {ECMWF_MODEL_LABEL}…</span>}
                  {modelGridError && <span className="text-red-400">{modelGridError}</span>}
                </div>
              )}
              {crossSectionMode && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] bg-amber-950/90 backdrop-blur border border-amber-700/60 rounded-xl px-4 py-2 text-sm text-amber-200 pointer-events-none text-center max-w-md">
                  Click two points on the map for a vertical cross-section (RHI)
                  {mode === "models" ? " · ECMWF temperature profile" : ""}
                </div>
              )}
            </>
          )}

          {crossSectionMode && mode === "station" && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[650] bg-amber-950/90 backdrop-blur border border-amber-700/60 rounded-xl px-4 py-2 text-sm text-amber-200 pointer-events-none text-center max-w-md">
              Click a point on the map to slice outward from {selectedStation?.id ?? "the radar"}
            </div>
          )}

          {probeMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[650] bg-cyan-950/90 backdrop-blur border border-cyan-700/60 rounded-xl px-4 py-2 text-sm text-cyan-200 pointer-events-none text-center max-w-md">
              Move cursor over the map to read {mode === "station" ? selectedProduct.label.toLowerCase() : "reflectivity"}
            </div>
          )}

          <PixelProbePanel
            active={probeMode}
            result={probeResult}
            loading={probeLoading}
            onClose={() => {
              setProbeMode(false);
              setProbePoint(null);
              setProbeResult(null);
            }}
          />

          {/* ─── Map overlays (bottom-right) ─────────────────────────────── */}
          {!splitViewActive && (
          <div className="absolute bottom-28 sm:bottom-24 right-3 z-[500] flex flex-col gap-2 items-end pointer-events-none">

            <button
              onClick={() => setLegendVisible(v => !v)}
              className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-900/90 backdrop-blur border border-gray-700 text-xs text-gray-400 hover:text-white transition-colors">
              <Info className="w-3.5 h-3.5" />
              {legendVisible ? "Hide key" : "Show key"}
            </button>

            {legendVisible && (
              <>
                {mode === "models" ? (
                  <ModelFieldLegend variableId={modelVariableId} unit={activeModelVariable.unit} />
                ) : (
                <div className="bg-gray-900/90 backdrop-blur rounded-xl p-3 border border-gray-700 pointer-events-auto">
                  <p className="text-xs text-gray-400 mb-1.5 font-medium">
                    {mode === "station" && selectedStation
                      ? `${selectedProduct.label} (${selectedProduct.id})${activeTiltLabel && productSupportsTilt(selectedProduct) ? ` · ${activeTiltLabel}` : ""}`
                      : "Reflectivity"}
                    <span className="ml-1.5 text-gray-600">· {legendScaleLabel}</span>
                  </p>
                  <div className="h-3 w-40 rounded" style={{ background: legendGradient }} />
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>{legendMin}</span>
                    <span>{legendMax}</span>
                  </div>
                </div>
                )}

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

                {settings.weatherAlertsEnabled && (
                  <div className="bg-gray-900/90 backdrop-blur rounded-xl p-2.5 border border-red-700/50 pointer-events-auto text-xs max-w-[12rem]">
                    <div className="flex items-center gap-1.5 text-red-400 font-medium mb-1.5">
                      <ShieldAlert className="w-3 h-3" /> Active alerts
                    </div>
                    {ALERT_SEVERITY_LEGEND.map((item) => (
                      <div key={item.key} className="flex items-center gap-2 mb-0.5">
                        <span
                          className="w-3 h-2 rounded-sm border flex-shrink-0"
                          style={{ backgroundColor: item.fill, borderColor: item.stroke }}
                        />
                        <span className="text-gray-400">{item.label}</span>
                      </div>
                    ))}
                    {weatherAlertsLoading && (
                      <p className="mt-1.5 text-gray-500">Loading alerts…</p>
                    )}
                    {weatherAlertsError && (
                      <p className="mt-1.5 text-red-400/90">{weatherAlertsError}</p>
                    )}
                    {!weatherAlertsLoading && weatherAlerts && (
                      <p className="mt-1.5 text-gray-500">
                        {weatherAlerts.alerts.length.toLocaleString()} alerts
                        {weatherAlerts.source ? ` · ${weatherAlerts.source}` : ""}
                      </p>
                    )}
                  </div>
                )}

                {settings.weatherRiskEnabled && (
                  <div className="bg-gray-900/90 backdrop-blur rounded-xl p-2.5 border border-orange-700/50 pointer-events-auto text-xs max-w-[12rem]">
                    <div className="flex items-center gap-1.5 text-orange-400 font-medium mb-1.5">
                      <AlertTriangle className="w-3 h-3" /> Convective Risk
                    </div>
                    <p className="text-[10px] text-gray-500 mb-1.5">US · SPC Day {settings.weatherRiskDay}</p>
                    {SPC_RISK_LEGEND.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 mb-0.5">
                        <span
                          className="w-3 h-2 rounded-sm border flex-shrink-0"
                          style={{ backgroundColor: item.fill, borderColor: item.stroke }}
                        />
                        <span className="text-gray-400">{item.name}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-500 mt-2 mb-1">Europe · MesoCast Day {settings.weatherRiskDay}</p>
                    {MESOCAST_RISK_LEGEND.map((item) => (
                      <div key={item.key} className="flex items-center gap-2 mb-0.5">
                        <span
                          className="w-3 h-2 rounded-sm border flex-shrink-0"
                          style={{ backgroundColor: item.fill, borderColor: item.stroke }}
                        />
                        <span className="text-gray-400">{item.name}</span>
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-600 mt-2">
                      Dashed: Conditional (8 4) · Hatched (4 2)
                    </p>
                    {weatherRiskLoading && (
                      <p className="mt-1.5 text-gray-500">Loading outlook…</p>
                    )}
                    {weatherRiskError && (
                      <p className="mt-1.5 text-red-400/90">{weatherRiskError}</p>
                    )}
                    {esslOutlookLoading && (
                      <p className="mt-1.5 text-gray-500">Loading ESSL outlook…</p>
                    )}
                    {esslOutlookError && (
                      <p className="mt-1.5 text-red-400/90">ESSL: {esslOutlookError}</p>
                    )}
                    {!weatherRiskLoading && weatherRiskOutlook?.sources.length ? (
                      <p className="mt-1.5 text-gray-500">
                        {weatherRiskOutlook.sources.join(" · ")}
                      </p>
                    ) : null}
                    {esslOutlookImageUrl && (
                      <p className="mt-1.5 text-[10px] text-gray-500">
                        ESSL overlay: {ESSL_OUTLOOK_LABELS[settings.weatherRiskType]}
                      </p>
                    )}
                    {!weatherRiskLoading && weatherRiskOutlook?.issueTime && (
                      <p className="mt-0.5 text-gray-500">
                        SPC issued {weatherRiskOutlook.issueTime}
                      </p>
                    )}
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
          )}

          {/* Attribution */}
          {!splitViewActive && (
          <div className="absolute bottom-28 sm:bottom-24 left-3 z-[500] text-gray-600 text-xs space-y-0.5 pointer-events-none">
            <div>
              Radar: RainViewer + IEM US
              {mode === "station" && dataSource === "iem" && " · IEM/NEXRAD"}
              {mode === "station" && dataSource === "level3" && " · NOAA Level-III"}
              {mode === "station" && dataSource === "opera" && " · EUMETNET OPERA"}
            </div>
            <div>
              Map: CartoDB / ESRI
              {mode === "models" ? " · Open-Meteo ECMWF IFS" : ""}
              {settings.weatherRiskEnabled ? " · SPC/NOAA · MesoCast · MeteoAlarm" : ""}
              {settings.weatherAlertsEnabled ? " · IFRC Alert Hub" : ""}
              {lightningEnabled ? " · Blitzortung" : ""}
            </div>
          </div>
          )}

          {mode === "models" && !crossSectionMode && !modelGridLoading && !splitViewActive && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-gray-900/90 backdrop-blur border border-orange-700/50 rounded-xl px-4 py-2 text-sm text-gray-300 pointer-events-none whitespace-nowrap">
              <Globe2 className="w-4 h-4 inline mr-1.5 text-orange-400" />
              Hourly ECMWF forecast · pick a layer on the right
            </div>
          )}

          {mode === "station" && !selectedStation && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-gray-900/90 backdrop-blur border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-300 pointer-events-none whitespace-nowrap">
              <Radio className="w-4 h-4 inline mr-1.5 text-blue-400" />
              Click any station dot to view its radar
            </div>
          )}

          {mode === "alerts" && !selectedAlert && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-gray-900/90 backdrop-blur border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-300 pointer-events-none whitespace-nowrap">
              <ShieldAlert className="w-4 h-4 inline mr-1.5 text-red-400" />
              Select an alert to view details and fly to its location
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
          </Panel>

          {rhiPanelOpen && (
            <>
              <PanelResizeHandle className="h-1.5 bg-gray-800 hover:bg-amber-600 transition-colors" />
              <Panel defaultSize={32} minSize={18}>
                <CrossSectionPanel
                  result={crossSectionResult}
                  loading={crossSectionLoading}
                  error={crossSectionError}
                  onClose={() => {
                    setRhiPanelOpen(false);
                    setCrossSectionMode(false);
                    setCrossSectionStart(null);
                    setCrossSectionEnd(null);
                  }}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* ─── Timeline ───────────────────────────────────────────────────── */}
      {mode === "models" ? (
        <ModelTimeline
          times={modelTimes}
          hourIndex={modelHourIndex}
          playing={modelPlaying}
          loading={modelTimesLoading || modelGridLoading}
          onHourChange={setModelHourIndex}
          onPlayingChange={setModelPlaying}
          opacity={modelOpacity}
          onOpacityChange={setModelOpacity}
        />
      ) : (
      <div className="relative flex-shrink-0 bg-gray-900 border-t border-gray-800 px-3 sm:px-4 py-2 sm:py-2.5 z-[1000]">
        <div className="max-w-5xl mx-auto">
          {currentFrame && (
            <div className="flex items-center gap-2 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <span className="text-sm font-medium">{formatTime(currentFrame.time)}</span>
              <span className="text-sm text-gray-500 hidden xs:block">{formatDate(currentFrame.time)}</span>
              {useStationTimeline && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-gray-800 text-gray-400 border border-gray-700">
                  {frameIndex + 1} / {timelineFrames.length}
                </span>
              )}
            </div>
          )}

          {timelineFrames.length > 0 && (
            <div className="flex gap-0.5 mb-2 h-4 sm:h-2">
              {timelineFrames.map((f, i) => (
                  <button key={`${f.time}-${i}`}
                    onClick={() => { setPlaying(false); setFrameIndex(i); }}
                    className={`flex-1 rounded transition-all h-full ${i === frameIndex ? "bg-blue-500 sm:scale-y-150" : "bg-gray-700 hover:bg-gray-500"}`}
                    title={formatTime(f.time)} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button onClick={() => stepFrame(-1)} disabled={frameIndex === 0}
              className="p-2 sm:p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors text-gray-300">
              <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>
            <button onClick={() => setPlaying(!playing)}
              className="flex items-center gap-2 px-4 py-2 sm:py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
              {playing ? <Pause className="w-4 h-4 sm:w-3.5 sm:h-3.5" /> : <Play className="w-4 h-4 sm:w-3.5 sm:h-3.5" />}
              {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => stepFrame(1)} disabled={frameIndex === timelineFrames.length - 1}
              className="p-2 sm:p-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-30 transition-colors text-gray-300">
              <ChevronRight className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500 hidden sm:block">Opacity</span>
              <input type="range" min={0.1} max={1} step={0.05} value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
                className="w-20 sm:w-24 h-1.5 sm:h-1 accent-blue-500" />
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
