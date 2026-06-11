import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { GeoJsonFeatureCollection } from "@/lib/geoJson";
import {
  ALERT_SEVERITY_LEGEND,
  alertStyleForFeature,
  formatAlertExpiry,
  type AlertFeatureProperties,
} from "@/lib/weatherAlerts";

interface Props {
  geojson: GeoJsonFeatureCollection;
  opacity: number;
  selectedRecordId?: string | null;
}

export default function WeatherAlertsLayer({ geojson, opacity, selectedRecordId = null }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const opacityRef = useRef(opacity);
  const selectedRef = useRef(selectedRecordId);

  opacityRef.current = opacity;
  selectedRef.current = selectedRecordId;

  useEffect(() => {
    layerRef.current?.remove();
    layerRef.current = null;

    if (!geojson.features.length) return;

    const layer = L.geoJSON(geojson, {
      style: (feature) => {
        const props = feature?.properties as AlertFeatureProperties | undefined;
        const selected = props?.recordId && props.recordId === selectedRef.current;
        const base = alertStyleForFeature(props, opacityRef.current);
        return {
          ...base,
          opacity: 0.95,
          weight: selected ? base.weight + 2 : base.weight,
          fillOpacity: selected ? Math.min(0.85, base.fillOpacity + 0.2) : base.fillOpacity,
        };
      },
      onEachFeature: (feature, pathLayer) => {
        const props = feature.properties as AlertFeatureProperties | undefined;
        const title = props?.headline ?? props?.event ?? "Alert";
        const area = props?.area;
        const country = props?.country;
        const expires = formatAlertExpiry(props?.expires);
        const kindLabel = props?.kind === "watch" ? "Watch" : props?.kind === "warning" ? "Warning" : "Advisory";
        pathLayer.bindTooltip(
          `<strong>${title}</strong><br/>${kindLabel}${country ? ` · ${country}` : ""}${area ? `<br/>${area}` : ""}${expires ? `<br/>Until ${expires}` : ""}`,
          { sticky: true, className: "weather-alert-tooltip" },
        );
      },
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      layer.remove();
      if (layerRef.current === layer) layerRef.current = null;
    };
  }, [map, geojson]);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.setStyle((feature) => {
      const props = feature?.properties as AlertFeatureProperties | undefined;
      const selected = props?.recordId && props.recordId === selectedRef.current;
      const base = alertStyleForFeature(props, opacity);
      return {
        ...base,
        opacity: 0.95,
        weight: selected ? base.weight + 2 : base.weight,
        fillOpacity: selected ? Math.min(0.85, base.fillOpacity + 0.2) : base.fillOpacity,
      };
    });
  }, [opacity, selectedRecordId]);

  return null;
}

export function severityColor(severity: string): string {
  return ALERT_SEVERITY_LEGEND.find((r) => r.key === severity)?.fill ?? ALERT_SEVERITY_LEGEND[4].fill;
}
