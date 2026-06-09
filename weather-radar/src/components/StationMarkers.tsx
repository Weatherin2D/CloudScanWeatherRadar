import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { RadarStation } from "@/data/stations";
import { COUNTRY_COLORS } from "@/data/stations";
import { isStationSupported, stationSupportHint } from "@/lib/stationSupport";

interface Props {
  stations: RadarStation[];
  selected: RadarStation | null;
  onSelect: (station: RadarStation) => void;
  zoom: number;
}

export default function StationMarkers({ stations, selected, onSelect, zoom }: Props) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.clearLayers();

    const baseRadius = zoom < 4 ? 3 : zoom < 6 ? 5 : 7;
    const badgeOffset = zoom < 5 ? 0.12 : zoom < 7 ? 0.06 : 0.03;

    stations.forEach((station) => {
      const isSelected = selected?.id === station.id;
      const supported = isStationSupported(station);
      const countryColor = COUNTRY_COLORS[station.country] ?? "#60a5fa";

      const marker = L.circleMarker([station.lat, station.lon], {
        radius: isSelected ? baseRadius + 3 : baseRadius,
        color: isSelected ? "#ffffff" : supported ? countryColor : "#ef4444",
        fillColor: isSelected ? "#6b7280" : supported ? countryColor : "#374151",
        fillOpacity: isSelected ? 1 : supported ? 0.65 : 0.45,
        weight: isSelected ? 2.5 : supported ? 1 : 2,
      });

      const status = supported ? "" : " ⚠ No per-station data";
      marker.bindTooltip(`${station.name} (${station.id})${status}`, {
        permanent: false,
        direction: "top",
        className: "radar-tooltip",
      });

      marker.on("click", () => onSelect(station));
      layerRef.current!.addLayer(marker);

      if (!supported) {
        const badge = L.circleMarker(
          [station.lat + badgeOffset, station.lon + badgeOffset],
          {
            radius: Math.max(2, baseRadius * 0.45),
            color: "#ffffff",
            fillColor: "#ef4444",
            fillOpacity: 1,
            weight: 1,
          },
        );
        badge.bindTooltip(stationSupportHint(station), {
          permanent: false,
          direction: "right",
          className: "radar-tooltip",
        });
        layerRef.current!.addLayer(badge);
      }
    });
  }, [stations, selected, zoom]);

  return null;
}
