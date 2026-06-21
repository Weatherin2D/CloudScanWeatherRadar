/**
 * Canvas-based RainViewer tile layer.
 * Uses RainViewer grayscale scheme (0) and remaps pixel luminance through a
 * user-supplied lookup table (256 RGBA entries) so custom colour scales apply.
 */
import { useEffect, useRef, useMemo } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { CanvasTileLayerClass, type CanvasTileLayer } from "@/lib/canvasTileLayer";
import { RAINVIEWER_TILE_OPTS } from "@/lib/radarTiles";

interface Props {
  frames: { time: number; path: string }[];
  frameIndex: number;
  opacity: number;
  lut: Uint8ClampedArray;
}

export default function CanvasRainViewerLayer({ frames, frameIndex, opacity, lut }: Props) {
  const map = useMap();
  const poolRef = useRef<Map<string, CanvasTileLayer>>(new Map());
  const lutRef = useRef(lut);

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
    lutRef.current = lut;
    poolRef.current.forEach((layer) => {
      layer.options.lut = lut;
      layer.redraw();
    });
  }, [lut]);

  useEffect(() => {
    preloadPaths.forEach((path) => {
      if (poolRef.current.has(path)) return;
      // Scheme 255 = raw dBZ in red channel (R&127)-32
      const url = `https://tilecache.rainviewer.com${path}/512/{z}/{x}/{y}/255/0_0.png`;
      const layer = new CanvasTileLayerClass(url, {
        ...RAINVIEWER_TILE_OPTS,
        opacity: 0,
        zIndex: 5,
        lut: lutRef.current,
        colorMode: "channel",
        attribution: "",
        tileSize: 512,
      });
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
  }, [preloadPaths, activePath, opacity, map]);

  useEffect(() => {
    return () => {
      poolRef.current.forEach((l) => l.remove());
      poolRef.current.clear();
    };
  }, [map]);

  return null;
}
