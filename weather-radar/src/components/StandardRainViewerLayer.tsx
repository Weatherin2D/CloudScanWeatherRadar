import { useEffect, useRef, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { RAINVIEWER_TILE_OPTS } from "@/lib/radarTiles";

interface Props {
  frames: { time: number; path: string }[];
  frameIndex: number;
  opacity: number;
  colorScheme: number;
}

export default function StandardRainViewerLayer({
  frames,
  frameIndex,
  opacity,
  colorScheme,
}: Props) {
  const map = useMap();
  const poolRef = useRef<Map<string, L.TileLayer>>(new Map());

  const preloadPaths = useMemo(() => {
    const paths = new Set<string>();
    if (!frames.length) return paths;
    for (let d = -2; d <= 2; d++) {
      const i = (frameIndex + d + frames.length) % frames.length;
      if (frames[i]) paths.add(frames[i].path);
    }
    return paths;
  }, [frames, frameIndex]);

  const activePath = frames[frameIndex]?.path ?? null;

  useEffect(() => {
    preloadPaths.forEach((path) => {
      if (poolRef.current.has(path)) return;
      const url = `https://tilecache.rainviewer.com${path}/512/{z}/{x}/{y}/${colorScheme}/0_0.png`;
      const layer = L.tileLayer(url, { ...RAINVIEWER_TILE_OPTS, opacity: 0, zIndex: 5, tileSize: 512 });
      layer.addTo(map);
      poolRef.current.set(path, layer);
    });

    Array.from(poolRef.current.entries()).forEach(([path, layer]) => {
      if (!preloadPaths.has(path)) {
        layer.remove();
        poolRef.current.delete(path);
      }
    });

    poolRef.current.forEach((layer, path) => {
      const active = path === activePath;
      layer.setOpacity(active ? opacity : 0);
      layer.setZIndex(active ? 10 : 5);
    });
  }, [preloadPaths, activePath, opacity, colorScheme, map]);

  useEffect(() => {
    return () => {
      poolRef.current.forEach((layer) => layer.remove());
      poolRef.current.clear();
    };
  }, [map]);

  return null;
}
