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
import { IEM_RIDGE_TILE_OPTS } from "@/lib/radarTiles";

export type StationRadarStatus = "idle" | "loading" | "ready" | "unsupported" | "unavailable";

interface Props {
  station: RadarStation | null;
  product: string;
  frames: StationRadarFrame[];
  frameIndex: number;
  opacity: number;
  reflectivityLut?: Uint8ClampedArray | null;
}

export default function StationRadarLayer({
  station,
  product,
  frames,
  frameIndex,
  opacity,
  reflectivityLut,
}: Props) {
  const map = useMap();
  const poolRef = useRef<Map<string, L.TileLayer>>(new Map());
  const lutRef = useRef(reflectivityLut);
  const layerConfigRef = useRef("");

  const useCustomReflectivity =
    isReflectivityProduct(product) && reflectivityLut != null;

  const preloadIds = useMemo(() => {
    const ids = new Set<string>();
    if (!frames.length || !station?.id) return ids;
    for (let d = -2; d <= 2; d++) {
      const i = (frameIndex + d + frames.length) % frames.length;
      const frame = frames[i];
      if (frame) ids.add(frame.tmsId);
    }
    return ids;
  }, [frames, frameIndex, station?.id]);

  const activeTmsId = frames[frameIndex]?.tmsId ?? null;

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
    if (!station?.id || station.country !== "us" || !isIemProductSupported(product)) {
      poolRef.current.forEach((layer) => layer.remove());
      poolRef.current.clear();
      layerConfigRef.current = "";
      return;
    }

    const layerConfig = `${station.id}:${product}:${useCustomReflectivity}`;
    if (layerConfigRef.current !== layerConfig) {
      poolRef.current.forEach((layer) => layer.remove());
      poolRef.current.clear();
      layerConfigRef.current = layerConfig;
    }

    preloadIds.forEach((tmsId) => {
      if (poolRef.current.has(tmsId)) return;
      const url = iemRidgeTileUrl(station.id, product, tmsId);

      const layer = useCustomReflectivity
        ? new CanvasTileLayerClass(url, {
            ...IEM_RIDGE_TILE_OPTS,
            opacity: 0,
            zIndex: 6,
            lut: lutRef.current ?? undefined,
            colorMode: "iem",
          })
        : L.tileLayer(url, {
            ...IEM_RIDGE_TILE_OPTS,
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
    product,
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
