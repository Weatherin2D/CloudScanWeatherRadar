import { useCallback } from "react";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import { parseLevel3 } from "@/lib/level3Parse";
import { level3ObjectUrl, type Level3Frame } from "@/lib/level3Radar";
import { renderLevel3Geographic } from "@/lib/renderPolar";
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
  const loadFrame = useCallback(
    async (frame: Level3Frame & { id: string }) => {
      const res = await fetch(level3ObjectUrl(frame.key));
      if (!res.ok) return null;
      const parsed = await parseLevel3(await res.arrayBuffer());
      if (!parsed) return null;
      return renderLevel3Geographic(
        parsed.layer,
        parsed.latitude,
        parsed.longitude,
        stops,
        2048,
        reflectivity,
        reflectivityFade,
      );
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
