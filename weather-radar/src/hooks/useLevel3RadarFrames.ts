import { useState, useEffect } from "react";
import type { RadarStation } from "@/data/stations";
import { fetchLevel3Frames, type Level3Frame } from "@/lib/level3Radar";
import { getRadarProduct } from "@/lib/radarProducts";

export function useLevel3RadarFrames(
  station: RadarStation | null,
  productId: string,
) {
  const [frames, setFrames] = useState<Level3Frame[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const product = getRadarProduct(productId);
    if (
      !station?.id ||
      station.country !== "us" ||
      product?.sources.us !== "level3" ||
      !product.fetchCode
    ) {
      setFrames([]);
      setLoading(false);
      return;
    }

    setFrames([]);
    setLoading(true);
    fetchLevel3Frames(station.id, product.fetchCode)
      .then(setFrames)
      .catch(() => setFrames([]))
      .finally(() => setLoading(false));
  }, [station?.id, station?.country, productId]);

  return { frames, loading };
}
