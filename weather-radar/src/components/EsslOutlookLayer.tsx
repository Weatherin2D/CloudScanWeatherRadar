import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

interface Props {
  imageUrl: string | null;
  opacity: number;
}

const WORLD_BOUNDS: L.LatLngBoundsExpression = [[-90, -180], [90, 180]];

export default function EsslOutlookLayer({ imageUrl, opacity }: Props) {
  const map = useMap();
  const overlayRef = useRef<L.ImageOverlay | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      overlayRef.current?.remove();
      overlayRef.current = null;
      return;
    }

    if (!overlayRef.current) {
      overlayRef.current = L.imageOverlay(imageUrl, WORLD_BOUNDS, {
        opacity,
        interactive: false,
        zIndex: 7,
      });
      overlayRef.current.addTo(map);
    } else {
      overlayRef.current.setUrl(imageUrl);
      overlayRef.current.setOpacity(opacity);
    }

    return () => {
      overlayRef.current?.remove();
      overlayRef.current = null;
    };
  }, [imageUrl, opacity, map]);

  return null;
}
