import { useCallback } from "react";
import type { RadarStation } from "@/data/stations";
import type { ColorStop, ReflectivityFadeSettings } from "@/lib/palPalette";
import { loadOdimScan, type OperaFrame } from "@/lib/operaRadar";
import { renderOdimPolarGates } from "@/lib/renderPolar";
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
  const loadFrame = useCallback(
    async (frame: OperaFrame & { id: string }) => {
      try {
        const scan = await loadOdimScan(frame.odimUrl, station.lat, station.lon);
        if (!scan) return null;
        return renderOdimPolarGates(scan, stops, 2048, reflectivity, reflectivityFade);
      } catch {
        return null;
      }
    },
    [station.lat, station.lon, stops, reflectivity, reflectivityFade],
  );

  const polarFrames = frames.map((f) => ({ ...f, id: f.odimUrl }));

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
