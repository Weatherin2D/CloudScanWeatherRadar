import { useCallback, useMemo } from "react";
import type { RadarStation } from "@/data/stations";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import { paletteCacheKey } from "@/lib/palPalette";
import { loadOdimScan, type OperaFrame } from "@/lib/operaRadar";
import { loadPolarFrameCached } from "@/lib/polarFrameCache";
import {
  POLAR_GATE_PREVIEW_SIZE,
  POLAR_GATE_STUDY_SIZE,
  renderOdimPolarGates,
  type PolarRenderResult,
} from "@/lib/renderPolar";
import PolarRadarLayer, { type PolarLoadQuality } from "./PolarRadarLayer";

interface Props {
  station: RadarStation;
  frames: OperaFrame[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
  reflectivity?: boolean;
  reflectivityFade?: ReflectivityFadeSettings;
}

/** OPERA station radar via ImageOverlay — instant pan/zoom transforms. */
export default function OperaRadarLayer({
  station,
  frames,
  frameIndex,
  opacity,
  stops,
  reflectivity = true,
  reflectivityFade,
}: Props) {
  const palKey = useMemo(
    () => paletteCacheKey(stops, reflectivity, reflectivityFade),
    [stops, reflectivity, reflectivityFade],
  );

  const loadFrame = useCallback(
    async (
      frame: OperaFrame & { id: string },
      quality: PolarLoadQuality = "preview",
    ): Promise<PolarRenderResult | null> => {
      const size = quality === "study" ? POLAR_GATE_STUDY_SIZE : POLAR_GATE_PREVIEW_SIZE;
      const cacheKey = `opera:g8:${quality}:${frame.odimUrl}:${station.lat}:${station.lon}:${palKey}`;
      return loadPolarFrameCached(cacheKey, async () => {
        try {
          const scan = await loadOdimScan(frame.odimUrl, station.lat, station.lon);
          if (!scan) return null;
          return renderOdimPolarGates(
            scan,
            stops,
            size,
            reflectivity,
            reflectivityFade,
          );
        } catch {
          return null;
        }
      });
    },
    [station.lat, station.lon, stops, reflectivity, reflectivityFade, palKey],
  );

  const polarFrames = useMemo(
    () => frames.map((f) => ({ ...f, id: f.odimUrl })),
    [frames],
  );

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
