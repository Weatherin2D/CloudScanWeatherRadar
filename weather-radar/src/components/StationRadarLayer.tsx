import { useEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { RadarStation } from "@/data/stations";
import {
  iemRidgeTileUrl,
  isIemProductSupported,
  isReflectivityProduct,
  type StationRadarFrame,
} from "@/lib/iemRadar";
import { CanvasTileLayerClass, type CanvasTileLayer } from "@/lib/canvasTileLayer";
import { STATION_IEM_TILE_OPTS } from "@/lib/radarTiles";

export type StationRadarStatus = "idle" | "loading" | "ready" | "unsupported" | "unavailable";

const LATEST_SCAN_FRAME: StationRadarFrame = { time: 0, tmsId: "0" };

interface Props {
  station: RadarStation | null;
  product: string;
  tilt?: number;
  frames: StationRadarFrame[];
  framesLoading?: boolean;
  frameIndex: number;
  opacity: number;
  reflectivityLut?: Uint8ClampedArray | null;
}

export default function StationRadarLayer({
  station,
  product,
  tilt = 0,
  frames,
  framesLoading = false,
  frameIndex,
  opacity,
  reflectivityLut,
}: Props) {
  const map = useMap();
  const poolRef = useRef<Map<string, L.TileLayer>>(new Map());
  const lutRef = useRef(reflectivityLut);
  const layerConfigRef = useRef("");

  // Convert product + tilt to IEM product code (N0B -> N1B, N2B, N3B for higher tilts)
  const iemProduct = useMemo(() => {
    const baseProd = product.toUpperCase();
    if (baseProd === "N0Q") {
      // N0Q maps to N0B, N1B, N2B, N3B
      return tilt === 0 ? "N0B" : `N${tilt}B`;
    }
    if (baseProd === "N0B" && tilt > 0) {
      return `N${tilt}B`;
    }
    return product;
  }, [product, tilt]);

  const useCustomReflectivity =
    isReflectivityProduct(iemProduct) && reflectivityLut != null;

  const displayFrames = useMemo(() => {
    if (frames.length > 0) return frames;
    if (framesLoading && station?.id) return [LATEST_SCAN_FRAME];
    return [];
  }, [frames, framesLoading, station?.id]);

  const safeFrameIndex = displayFrames.length > 0
    ? Math.min(frameIndex, displayFrames.length - 1)
    : 0;

  const preloadIds = useMemo(() => {
    const ids = new Set<string>();
    if (!displayFrames.length || !station?.id) return ids;
    const active = displayFrames[safeFrameIndex];
    if (active) ids.add(active.tmsId);
    if (displayFrames.length > 1) {
      const next = displayFrames[(safeFrameIndex + 1) % displayFrames.length];
      if (next) ids.add(next.tmsId);
    }
    return ids;
  }, [displayFrames, safeFrameIndex, station?.id]);

  const activeTmsId = displayFrames[safeFrameIndex]?.tmsId ?? null;

  useEffect(() => {
    lutRef.current = reflectivityLut;
    if (!useCustomReflectivity) return;
    poolRef.current.forEach((layer) => {
      const canvasLayer = layer as CanvasTileLayer;
      if (canvasLayer.options.lut) {
        canvasLayer.options.lut = reflectivityLut ?? undefined;
        canvasLayer.redraw();
      }
    });
  }, [reflectivityLut, useCustomReflectivity]);

  useEffect(() => {
    if (!station?.id || station.country !== "us" || !isIemProductSupported(iemProduct)) {
      poolRef.current.forEach((layer) => layer.remove());
      poolRef.current.clear();
      layerConfigRef.current = "";
      return;
    }

    const layerConfig = `${station.id}:${iemProduct}:${useCustomReflectivity}`;
    if (layerConfigRef.current !== layerConfig) {
      poolRef.current.forEach((layer) => layer.remove());
      poolRef.current.clear();
      layerConfigRef.current = layerConfig;
    }

    preloadIds.forEach((tmsId) => {
      if (poolRef.current.has(tmsId)) return;
      const url = iemRidgeTileUrl(station.id, iemProduct, tmsId);

      const layer = useCustomReflectivity
        ? new CanvasTileLayerClass(url, {
            ...STATION_IEM_TILE_OPTS,
            opacity: 0,
            zIndex: 6,
            lut: lutRef.current ?? undefined,
            colorMode: "iem",
          })
        : L.tileLayer(url, {
            ...STATION_IEM_TILE_OPTS,
            opacity: 0,
            zIndex: 6,
          });

      layer.addTo(map);
      poolRef.current.set(tmsId, layer);
    });

    Array.from(poolRef.current.entries()).forEach(([tmsId, layer]) => {
      if (!preloadIds.has(tmsId)) {
        layer.remove();
        poolRef.current.delete(tmsId);
      }
    });

    poolRef.current.forEach((layer, tmsId) => {
      const active = tmsId === activeTmsId;
      layer.setOpacity(active ? opacity : 0);
      layer.setZIndex(active ? 11 : 6);
    });
  }, [
    station,
    iemProduct,
    preloadIds,
    activeTmsId,
    opacity,
    map,
    useCustomReflectivity,
  ]);

  useEffect(() => {
    return () => {
      poolRef.current.forEach((layer) => layer.remove());
      poolRef.current.clear();
    };
  }, [map]);

  return null;
}
