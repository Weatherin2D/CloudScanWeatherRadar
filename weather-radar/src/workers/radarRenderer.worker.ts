/**
 * Web Worker for rendering Level 3 radar data off the main thread.
 * This prevents UI blocking and allows smooth, responsive rendering.
 */

import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import {
  colorAtReflectivityDbz,
  DEFAULT_REFLECTIVITY_FADE,
} from "@/lib/palPalette";
import type { Level3RadialLayer } from "@/lib/level3Parse";
import { sampleLevel3RadialInterp } from "@/lib/polarSample";

const DEG = Math.PI / 180;

function destination(lat: number, lon: number, bearingDeg: number, distKm: number) {
  const br = bearingDeg * DEG;
  const lat1 = lat * DEG;
  const lon1 = lon * DEG;
  const d = distKm / 6371;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: lat2 / DEG, lon: lon2 / DEG };
}

function level3GateBounds(
  layer: Level3RadialLayer,
  lat: number,
  lon: number,
): [[number, number], [number, number]] {
  let minLat = lat;
  let maxLat = lat;
  let minLon = lon;
  let maxLon = lon;

  for (const radial of layer.radials) {
    for (let b = 0; b < radial.bins.length; b++) {
      if (radial.bins[b] == null) continue;
      const rangeKm = (layer.firstBin + b) * layer.rangeScale;
      const pos = destination(lat, lon, radial.startAngle, rangeKm);
      minLat = Math.min(minLat, pos.lat);
      maxLat = Math.max(maxLat, pos.lat);
      minLon = Math.min(minLon, pos.lon);
      maxLon = Math.max(maxLon, pos.lon);
    }
  }

  const pad = 0.08;
  return [
    [minLat - pad, minLon - pad],
    [maxLat + pad, maxLon + pad],
  ];
}

interface RenderRequest {
  layer: Level3RadialLayer;
  lat: number;
  lon: number;
  stops: ColorStop[];
  maxSize: number;
  reflectivity: boolean;
  fade: ReflectivityFadeSettings;
}

interface RenderResponse {
  imageData: ImageData;
  bounds: [[number, number], [number, number]];
}

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  const { layer, lat, lon, stops, maxSize, reflectivity, fade } = e.data;

  const sampleColor = reflectivity
    ? (value: number, s: ColorStop[]) => colorAtReflectivityDbz(value, s, fade)
    : (value: number, s: ColorStop[]) => {
        // Simple fallback
        for (let i = s.length - 1; i >= 0; i--) {
          if (value >= s[i].dbz) {
            return [s[i].r, s[i].g, s[i].b, 255] as [number, number, number, number];
          }
        }
        return [0, 0, 0, 0] as [number, number, number, number];
      };

  const bounds = level3GateBounds(layer, lat, lon);
  const [[south, west], [north, east]] = bounds;
  const latSpan = Math.max(0.01, north - south);
  const lonSpan = Math.max(0.01, east - west);
  const cosLat = Math.max(0.2, Math.cos(lat * DEG));
  const width = maxSize;
  const height = Math.max(256, Math.round((width * latSpan) / (lonSpan * cosLat)));

  const imageData = new ImageData(width, height);
  const d = imageData.data;

  for (let py = 0; py < height; py++) {
    const gateLat = north - (py / Math.max(1, height - 1)) * latSpan;
    for (let px = 0; px < width; px++) {
      const gateLon = west + (px / Math.max(1, width - 1)) * lonSpan;
      const val = sampleLevel3RadialInterp(layer, lat, lon, gateLat, gateLon);
      const i = (py * width + px) * 4;
      if (val == null) {
        d[i + 3] = 0;
        continue;
      }
      const [r, g, b, a] = sampleColor(val, stops);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = a;
    }
  }

  const response: RenderResponse = { imageData, bounds };
  self.postMessage(response, [imageData.data.buffer]);
};
