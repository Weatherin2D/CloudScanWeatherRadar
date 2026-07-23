import { useCallback, useMemo } from "react";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import { paletteCacheKey } from "@/lib/palPalette";
import { parseLevel3 } from "@/lib/level3Parse";
import { level3ObjectUrl, type Level3Frame } from "@/lib/level3Radar";
import { loadPolarFrameCached } from "@/lib/polarFrameCache";
import { POLAR_GATE_MAX_SIZE, renderLevel3PolarGates } from "@/lib/renderPolar";
import PolarRadarLayer from "./PolarRadarLayer";

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
  const palKey = useMemo(
    () => paletteCacheKey(stops, reflectivity, reflectivityFade),
    [stops, reflectivity, reflectivityFade],
  );

  const loadFrame = useCallback(
    async (frame: Level3Frame & { id: string }) => {
      const cacheKey = `l3:g2:${frame.key}:${palKey}`;
      return loadPolarFrameCached(cacheKey, async () => {
        const res = await fetch(level3ObjectUrl(frame.key));
        if (!res.ok) return null;
        const parsed = await parseLevel3(await res.arrayBuffer());
        if (!parsed) return null;

        return renderLevel3PolarGates(
          parsed.layer,
          parsed.latitude,
          parsed.longitude,
          stops,
          POLAR_GATE_MAX_SIZE,
          reflectivity,
          reflectivityFade,
        );
      });
    },
    [stops, reflectivity, reflectivityFade, palKey],
  );

  const polarFrames = useMemo(
    () => frames.map((f) => ({ ...f, id: f.key })),
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
