import { useCallback, useMemo } from "react";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import { paletteCacheKey } from "@/lib/palPalette";
import { level3ObjectUrl, type Level3Frame } from "@/lib/level3Radar";
import { loadParsedLevel3 } from "@/lib/level3ParsedCache";
import { loadPolarFrameCached } from "@/lib/polarFrameCache";
import {
  POLAR_GATE_PREVIEW_SIZE,
  POLAR_GATE_STUDY_SIZE,
  renderLevel3PolarGates,
  type PolarRenderResult,
} from "@/lib/renderPolar";
import PolarRadarLayer, { type PolarLoadQuality } from "./PolarRadarLayer";

interface Props {
  frames: Level3Frame[];
  frameIndex: number;
  opacity: number;
  stops: ColorStop[];
  reflectivity?: boolean;
  reflectivityFade?: ReflectivityFadeSettings;
}

/**
 * Level-III station radar via Leaflet ImageOverlay.
 * Pan/zoom are instant (CSS transform); no post-move canvas redraw.
 */
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
    async (
      frame: Level3Frame & { id: string },
      quality: PolarLoadQuality = "preview",
    ): Promise<PolarRenderResult | null> => {
      const size = quality === "study" ? POLAR_GATE_STUDY_SIZE : POLAR_GATE_PREVIEW_SIZE;
      const cacheKey = `l3:g5:${quality}:${frame.key}:${palKey}`;
      return loadPolarFrameCached(cacheKey, async () => {
        const parsed = await loadParsedLevel3(frame.key, level3ObjectUrl(frame.key));
        if (!parsed) return null;
        return renderLevel3PolarGates(
          parsed.layer,
          parsed.latitude,
          parsed.longitude,
          stops,
          size,
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
