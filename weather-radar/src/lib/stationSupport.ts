import type { RadarStation } from "@/data/stations";
import { operaMetaForStation } from "@/lib/operaRadar";

/** Per-station radar is available for this site in Station mode. */
export function isStationSupported(station: RadarStation): boolean {
  if (station.country === "us") return true;
  if (station.country === "eu") return operaMetaForStation(station.id) != null;
  return false;
}

export function stationSupportHint(station: RadarStation): string {
  if (station.country === "us") return "US NEXRAD — multi-product";
  if (station.country === "eu") {
    return operaMetaForStation(station.id)
      ? "Europe OPERA — reflectivity & velocity"
      : "No OPERA feed mapped for this site";
  }
  if (station.country === "uk") return "UK sites — use Global mode";
  if (station.country === "au") return "Australia — use Global mode";
  return "Use Global mode for this region";
}
