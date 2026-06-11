import { lazy, Suspense, useMemo } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import type { RadarStation } from "@/data/stations";
import {
  getRadarProduct,
  isReflectivityFamily,
  type RadarProduct,
} from "@/lib/radarProducts";
import { resolveStationDataSource } from "@/lib/radarTilt";
import { isReflectivityProduct } from "@/lib/iemRadar";
import { useStationRadarFrames } from "@/hooks/useStationRadarFrames";
import { useLevel3RadarFrames } from "@/hooks/useLevel3RadarFrames";
import { useOperaRadarFrames } from "@/hooks/useOperaRadarFrames";
import StationRadarLayer from "@/components/StationRadarLayer";
import MapFlyTo from "@/components/MapFlyTo";
import MapViewSync, { type MapViewState } from "@/components/MapViewSync";
import CrossSectionTool from "@/components/CrossSectionTool";
import type { LatLng } from "@/lib/crossSection";
import {
  stopsToIemIndexLUT,
  stopsValueSpan,
  stopsToCss,
  normalizeReflectivityFade,
  type ColorStop,
} from "@/lib/colorScale";

const Level3RadarLayer = lazy(() => import("@/components/Level3RadarLayer"));
const OperaRadarLayer = lazy(() => import("@/components/OperaRadarLayer"));

const TILE_URLS = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

export interface RadarMapPaneProps {
  paneIndex: number;
  productId: string;
  tiltIndex: number;
  station: RadarStation;
  frameIndex: number;
  opacity: number;
  mapType: "dark" | "satellite";
  mapView: MapViewState;
  onMapViewChange: (view: MapViewState) => void;
  syncInteractive: boolean;
  products: RadarProduct[];
  onProductChange: (paneIndex: number, productId: string) => void;
  crossSectionMode: boolean;
  crossSectionStart: LatLng | null;
  crossSectionEnd: LatLng | null;
  onCrossSectionPoint: (point: LatLng) => void;
  customReflectivityStops: ColorStop[];
  isCustomScale: boolean;
  reflectivityFadeStart: number;
  reflectivityFadeEnd: number;
  compact?: boolean;
}

function paletteStopsForProduct(
  product: RadarProduct,
  isCustomScale: boolean,
  customReflectivityStops: ColorStop[],
): ColorStop[] {
  if (isCustomScale && isReflectivityFamily(product.family)) {
    return customReflectivityStops;
  }
  return product.defaultStops;
}

export default function RadarMapPane({
  paneIndex,
  productId,
  tiltIndex,
  station,
  frameIndex,
  opacity,
  mapType,
  mapView,
  onMapViewChange,
  syncInteractive,
  products,
  onProductChange,
  crossSectionMode,
  crossSectionStart,
  crossSectionEnd,
  onCrossSectionPoint,
  customReflectivityStops,
  isCustomScale,
  reflectivityFadeStart,
  reflectivityFadeEnd,
  compact = false,
}: RadarMapPaneProps) {
  const product = getRadarProduct(productId) ?? products[0];
  const dataSource = resolveStationDataSource(product.id, station.country, tiltIndex);

  const { frames: stationFrames, loading: stationFramesLoading } = useStationRadarFrames(
    station,
    product.id,
    tiltIndex,
  );
  const { frames: level3Frames } = useLevel3RadarFrames(station, product.id, tiltIndex);
  const { frames: operaFrames } = useOperaRadarFrames(station, product.id, tiltIndex);

  const reflectivityFade = useMemo(
    () => normalizeReflectivityFade(reflectivityFadeStart, reflectivityFadeEnd),
    [reflectivityFadeStart, reflectivityFadeEnd],
  );

  const paletteStops = useMemo(
    () => paletteStopsForProduct(product, isCustomScale, customReflectivityStops),
    [product, isCustomScale, customReflectivityStops],
  );

  const stationIemLUT = useMemo(
    () => stopsToIemIndexLUT(customReflectivityStops, reflectivityFade),
    [customReflectivityStops, reflectivityFade],
  );

  const legendSpan = useMemo(() => stopsValueSpan(paletteStops), [paletteStops]);
  const legendGradient = useMemo(
    () => stopsToCss(paletteStops, legendSpan.min, legendSpan.max),
    [paletteStops, legendSpan.min, legendSpan.max],
  );

  return (
    <div className="relative h-full w-full flex flex-col min-h-0 bg-gray-950">
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-2 py-1.5 bg-gray-900/95 border-b border-gray-800">
        <select
          value={product.id}
          onChange={(e) => onProductChange(paneIndex, e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-md text-xs text-white px-2 py-1 max-w-[60%] truncate"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} ({p.id})
            </option>
          ))}
        </select>
        <span className="text-[10px] text-gray-500 truncate">
          {station.id}
          {!compact && product.legendMin && product.legendMax
            ? ` · ${product.legendMin}–${product.legendMax}`
            : ""}
        </span>
      </div>

      <div className="relative flex-1 min-h-0">
        <MapContainer
          center={[mapView.lat, mapView.lon]}
          zoom={mapView.zoom}
          style={{ width: "100%", height: "100%" }}
          zoomControl={paneIndex === 0}
          attributionControl={false}
          worldCopyJump
        >
          <TileLayer url={TILE_URLS[mapType]} />
          <MapViewSync
            view={mapView}
            onViewChange={onMapViewChange}
            interactive={syncInteractive}
          />
          {paneIndex === 0 && <MapFlyTo station={station} />}

          {dataSource === "iem" && (
            <StationRadarLayer
              station={station}
              product={product.id}
              frames={stationFrames}
              framesLoading={stationFramesLoading}
              frameIndex={frameIndex}
              opacity={opacity}
              reflectivityLut={
                isCustomScale && isReflectivityProduct(product.id) ? stationIemLUT : null
              }
            />
          )}
          {dataSource === "level3" && level3Frames.length > 0 && (
            <Suspense fallback={null}>
              <Level3RadarLayer
                frames={level3Frames}
                frameIndex={frameIndex}
                opacity={opacity}
                stops={paletteStops}
                reflectivity={isReflectivityFamily(product.family)}
                reflectivityFade={reflectivityFade}
              />
            </Suspense>
          )}
          {dataSource === "opera" && operaFrames.length > 0 && (
            <Suspense fallback={null}>
              <OperaRadarLayer
                station={station}
                frames={operaFrames}
                frameIndex={frameIndex}
                opacity={opacity}
                stops={paletteStops}
                reflectivity={isReflectivityFamily(product.family)}
                reflectivityFade={reflectivityFade}
              />
            </Suspense>
          )}

          {crossSectionMode && (
            <CrossSectionTool
              active={crossSectionMode}
              start={crossSectionStart}
              end={crossSectionEnd}
              onPoint={onCrossSectionPoint}
            />
          )}
        </MapContainer>

        <div className="absolute bottom-2 left-2 right-2 z-[500] pointer-events-none">
          <div className="bg-gray-900/90 backdrop-blur rounded-lg px-2 py-1 border border-gray-700">
            <div className="h-2 rounded" style={{ background: legendGradient }} />
            <div className="flex justify-between mt-0.5 text-[9px] text-gray-500">
              <span>{product.legendMin ?? legendSpan.min}</span>
              <span className="text-gray-400 truncate mx-1">{product.shortLabel}</span>
              <span>{product.legendMax ?? legendSpan.max}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
