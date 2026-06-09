import { useState, useEffect } from "react";
import type { RadarStation } from "@/data/stations";
import { fetchOperaFrames, operaMetaForStation, type OperaFrame } from "@/lib/operaRadar";
import { getRadarProduct } from "@/lib/radarProducts";

export function useOperaRadarFrames(
  station: RadarStation | null,
  productId: string,
) {
  const [frames, setFrames] = useState<OperaFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const hasOpera = station ? operaMetaForStation(station.id) != null : false;

  useEffect(() => {
    const product = getRadarProduct(productId);
    if (
      !station?.id ||
      station.country !== "eu" ||
      !hasOpera ||
      product?.sources.eu !== "opera" ||
      !product.fetchCode
    ) {
      setFrames([]);
      setLoading(false);
      return;
    }

    setFrames([]);
    setLoading(true);
    fetchOperaFrames(
      station.id,
      product.fetchCode as "DBZH" | "VRADH",
    )
      .then(setFrames)
      .catch(() => setFrames([]))
      .finally(() => setLoading(false));
  }, [station?.id, station?.country, productId, hasOpera]);

  return { frames, loading, hasOpera };
}
