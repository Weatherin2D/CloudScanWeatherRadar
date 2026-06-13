import { useEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import {
  GLOBAL_IEM_PRODUCT,
  GLOBAL_IEM_RADAR,
  type GlobalRadarFrame,
} from "@/lib/globalRadar";
import { iemRidgeTileUrl } from "@/lib/iemRadar";
import { CanvasTileLayerClass, type CanvasTileLayer } from "@/lib/canvasTileLayer";
import { RAINVIEWER_TILE_OPTS, STATION_IEM_TILE_OPTS } from "@/lib/radarTiles";

interface Props {
  frames: GlobalRadarFrame[];
  frameIndex: number;
  opacity: number;
  isCustomScale: boolean;
  colorScheme: number;
  rainViewerLut?: Uint8ClampedArray;
  iemReflectivityLut?: Uint8ClampedArray | null;
}

function frameKey(frame: GlobalRadarFrame): string {
  return `${frame.rainViewerPath ?? ""}|${frame.iemTmsId ?? ""}`;
}

export default function GlobalRadarLayer({
  frames,
  frameIndex,
  opacity,
  isCustomScale,
  colorScheme,
  rainViewerLut,
  iemReflectivityLut,
}: Props) {
  const map = useMap();
  const rvPoolRef = useRef<Map<string, L.TileLayer>>(new Map());
  const iemPoolRef = useRef<Map<string, L.TileLayer>>(new Map());
  const iemLutRef = useRef(iemReflectivityLut);
  const rvLutRef = useRef(rainViewerLut);

  const safeIndex = frames.length ? Math.min(frameIndex, frames.length - 1) : 0;
  const activeFrame = frames[safeIndex];

  const preloadKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!frames.length) return keys;
    for (let d = -2; d <= 2; d++) {
      const i = (safeIndex + d + frames.length) % frames.length;
      const frame = frames[i];
      if (frame) keys.add(frameKey(frame));
    }
    return keys;
  }, [frames, safeIndex]);

  const activeKey = activeFrame ? frameKey(activeFrame) : null;

  useEffect(() => {
    rvLutRef.current = rainViewerLut;
    if (!isCustomScale) return;
    rvPoolRef.current.forEach((layer) => {
      const canvasLayer = layer as CanvasTileLayer;
      if (canvasLayer.options.lut) {
        canvasLayer.options.lut = rainViewerLut;
        canvasLayer.redraw();
      }
    });
  }, [rainViewerLut, isCustomScale]);

  useEffect(() => {
    iemLutRef.current = iemReflectivityLut;
    if (!isCustomScale || !iemReflectivityLut) return;
    iemPoolRef.current.forEach((layer) => {
      const canvasLayer = layer as CanvasTileLayer;
      if (canvasLayer.options.lut) {
        canvasLayer.options.lut = iemReflectivityLut;
        canvasLayer.redraw();
      }
    });
  }, [iemReflectivityLut, isCustomScale]);

  useEffect(() => {
    const neededRv = new Map<string, string>();
    const neededIem = new Map<string, string>();

    preloadKeys.forEach((key) => {
      const frame = frames.find((f) => frameKey(f) === key);
      if (!frame) return;
      if (frame.rainViewerPath) neededRv.set(key, frame.rainViewerPath);
      if (frame.iemTmsId && !frame.rainViewerPath) neededIem.set(key, frame.iemTmsId);
    });

    neededRv.forEach((path, key) => {
      if (rvPoolRef.current.has(key)) return;
      const url = isCustomScale
        ? `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/255/0_0.png`
        : `https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/${colorScheme}/0_0.png`;
      const layer = isCustomScale
        ? new CanvasTileLayerClass(url, {
            ...RAINVIEWER_TILE_OPTS,
            opacity: 0,
            zIndex: 6,
            lut: rvLutRef.current,
            colorMode: "channel",
            attribution: "",
          })
        : L.tileLayer(url, { ...RAINVIEWER_TILE_OPTS, opacity: 0, zIndex: 6 });
      layer.addTo(map);
      rvPoolRef.current.set(key, layer);
    });

    neededIem.forEach((tmsId, key) => {
      if (iemPoolRef.current.has(key)) return;
      const url = iemRidgeTileUrl(GLOBAL_IEM_RADAR, GLOBAL_IEM_PRODUCT, tmsId);
      const layer = isCustomScale && iemReflectivityLut
        ? new CanvasTileLayerClass(url, {
            ...STATION_IEM_TILE_OPTS,
            opacity: 0,
            zIndex: 5,
            lut: iemLutRef.current ?? undefined,
            colorMode: "iem",
          })
        : L.tileLayer(url, { ...STATION_IEM_TILE_OPTS, opacity: 0, zIndex: 5 });
      layer.addTo(map);
      iemPoolRef.current.set(key, layer);
    });

    rvPoolRef.current.forEach((layer, key) => {
      if (!neededRv.has(key)) {
        layer.remove();
        rvPoolRef.current.delete(key);
      }
    });
    iemPoolRef.current.forEach((layer, key) => {
      if (!neededIem.has(key)) {
        layer.remove();
        iemPoolRef.current.delete(key);
      }
    });

    rvPoolRef.current.forEach((layer, key) => {
      const active = key === activeKey && !!activeFrame?.rainViewerPath;
      layer.setOpacity(active ? opacity : 0);
      layer.setZIndex(active ? 11 : 6);
    });
    iemPoolRef.current.forEach((layer, key) => {
      const active = key === activeKey && !!activeFrame?.iemTmsId && !activeFrame?.rainViewerPath;
      layer.setOpacity(active ? opacity : 0);
      layer.setZIndex(active ? 10 : 5);
    });
  }, [
    preloadKeys,
    activeKey,
    activeFrame,
    frames,
    opacity,
    map,
    isCustomScale,
    colorScheme,
    iemReflectivityLut,
  ]);

  useEffect(() => () => {
    rvPoolRef.current.forEach((layer) => layer.remove());
    iemPoolRef.current.forEach((layer) => layer.remove());
    rvPoolRef.current.clear();
    iemPoolRef.current.clear();
  }, [map]);

  return null;
}
