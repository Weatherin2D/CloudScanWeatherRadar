import { useCallback } from "react";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import { parseLevel3 } from "@/lib/level3Parse";
import { level3ObjectUrl, type Level3Frame } from "@/lib/level3Radar";
import PolarRadarLayer from "./PolarRadarLayer";
import type { PolarRenderResult } from "@/lib/renderPolar";

interface Props {
  frames: Level3Frame[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
  reflectivity?: boolean;
  reflectivityFade?: ReflectivityFadeSettings;
}

export default function Level3RadarLayer({
  frames,
  frameIndex,
  opacity,
  stops,
  reflectivity = false,
  reflectivityFade,
}: Props) {
  const loadFrame = useCallback(
    async (frame: Level3Frame & { id: string }) => {
      const res = await fetch(level3ObjectUrl(frame.key));
      if (!res.ok) return null;
      const parsed = await parseLevel3(await res.arrayBuffer());
      if (!parsed) return null;

      // Use Web Worker for off-thread rendering
      return new Promise<PolarRenderResult | null>((resolve) => {
        const worker = new Worker(
          new URL("../workers/radarRenderer.worker.ts", import.meta.url),
          { type: "module" }
        );

        const timeout = setTimeout(() => {
          worker.terminate();
          console.error("Worker timeout");
          resolve(null);
        }, 30000); // 30 second timeout

        worker.onmessage = (e: MessageEvent) => {
          clearTimeout(timeout);
          
          if (e.data.error) {
            console.error("Worker error:", e.data.error);
            worker.terminate();
            resolve(null);
            return;
          }

          const { imageData, bounds } = e.data;
          
          // Convert ImageData to data URL on main thread (fast operation)
          const canvas = document.createElement("canvas");
          canvas.width = imageData.width;
          canvas.height = imageData.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(null);
            worker.terminate();
            return;
          }
          
          ctx.putImageData(imageData, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          
          resolve({ dataUrl, bounds });
          worker.terminate();
        };

        worker.onerror = (error) => {
          clearTimeout(timeout);
          console.error("Worker error:", error);
          resolve(null);
          worker.terminate();
        };

        worker.postMessage({
          layer: parsed.layer,
          lat: parsed.latitude,
          lon: parsed.longitude,
          stops,
          maxSize: 1024,
          reflectivity,
          fade: reflectivityFade,
        });
      });
    },
    [stops, reflectivity, reflectivityFade],
  );

  const polarFrames = frames.map((f) => ({ ...f, id: f.key }));

  return (
    <PolarRadarLayer
      frames={polarFrames}
      frameIndex={frameIndex}
      opacity={opacity}
      stops={stops}
      loadFrame={loadFrame}
    />
  );
}
