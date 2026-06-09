import { useCallback } from "react";
import type { ColorStop } from "@/lib/palPalette";
import { parseLevel3 } from "@/lib/level3Parse";
import { level3ObjectUrl, type Level3Frame } from "@/lib/level3Radar";
import { renderLevel3Radial } from "@/lib/renderPolar";
import PolarRadarLayer from "./PolarRadarLayer";

interface Props {
  frames: Level3Frame[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
}

export default function Level3RadarLayer({ frames, frameIndex, opacity, stops }: Props) {
  const loadFrame = useCallback(
    async (frame: Level3Frame & { id: string }) => {
      const res = await fetch(level3ObjectUrl(frame.key));
      if (!res.ok) return null;
      const parsed = await parseLevel3(await res.arrayBuffer());
      if (!parsed) return null;
      return renderLevel3Radial(
        parsed.layer,
        parsed.latitude,
        parsed.longitude,
        stops,
      );
    },
    [stops],
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
