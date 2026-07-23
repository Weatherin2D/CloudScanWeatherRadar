import { useCallback, useMemo } from "react";
import type { RadarStation } from "@/data/stations";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import { paletteCacheKey } from "@/lib/palPalette";
import { loadOdimScan, type OperaFrame } from "@/lib/operaRadar";
import { loadPolarFrameCached } from "@/lib/polarFrameCache";
import { POLAR_GATE_MAX_SIZE, renderOdimPolarGates } from "@/lib/renderPolar";
import PolarRadarLayer from "./PolarRadarLayer";

interface Props {
  station: RadarStation;
  frames: OperaFrame[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
  reflectivity?: boolean;
  reflectivityFade?: ReflectivityFadeSettings;
}

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
    async (frame: OperaFrame & { id: string }) => {
      const cacheKey = `opera:g2:${frame.odimUrl}:${station.lat}:${station.lon}:${palKey}`;
      return loadPolarFrameCached(cacheKey, async () => {
        try {
          const scan = await loadOdimScan(frame.odimUrl, station.lat, station.lon);
          if (!scan) return null;
          return renderOdimPolarGates(
            scan,
            stops,
            POLAR_GATE_MAX_SIZE,
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
