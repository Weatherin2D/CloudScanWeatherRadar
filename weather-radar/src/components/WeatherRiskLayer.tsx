import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { riskStyleForFeature, type ConvectiveRiskProperties } from "@/lib/convectiveRisk";
import type { GeoJsonFeatureCollection } from "@/lib/geoJson";

interface Props {
  geojson: GeoJsonFeatureCollection;
  opacity: number;
}

function tooltipForFeature(props: ConvectiveRiskProperties | undefined): string {
  const label = props?.LABEL2 ?? props?.LABEL ?? "Outlook";
  const source =
    props?.riskSource === "mesocast"
      ? "MesoCast"
      : props?.riskSource === "europe"
        ? "Active warning"
        : "SPC";

  const valid = props?.VALID_ISO
    ? new Date(props.VALID_ISO).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : null;

  return `<strong>${label}</strong><br/><span style="opacity:0.85">${source}</span>${
    valid ? `<br/>Valid: ${valid}` : ""
  }`;
}

export default function WeatherRiskLayer({ geojson, opacity }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const opacityRef = useRef(opacity);

  opacityRef.current = opacity;

  useEffect(() => {
    layerRef.current?.remove();
    layerRef.current = null;

    if (!geojson.features.length) return;

    const layer = L.geoJSON(geojson, {
      style: (feature) => {
        const props = feature?.properties as ConvectiveRiskProperties | undefined;
        return {
          ...riskStyleForFeature(props, opacityRef.current),
          opacity: 0.9,
        };
      },
      onEachFeature: (feature, pathLayer) => {
        const props = feature.properties as ConvectiveRiskProperties | undefined;
        pathLayer.bindTooltip(tooltipForFeature(props), {
          sticky: true,
          className: "weather-risk-tooltip",
        });
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
      const props = feature?.properties as ConvectiveRiskProperties | undefined;
      return {
        ...riskStyleForFeature(props, opacity),
        opacity: 0.9,
      };
    });
  }, [opacity]);

  return null;
}
