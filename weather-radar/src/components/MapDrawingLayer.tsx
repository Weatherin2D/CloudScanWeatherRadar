import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

export type DrawTool =
  | "freehand"
  | "polyline"
  | "polygon"
  | "rectangle"
  | "circle"
  | "marker"
  | "eraser";

interface Props {
  active: boolean;
  tool: DrawTool;
  color: string;
  strokeWidth?: number;
  undoSignal?: number;
  clearSignal?: number;
  onShapeCount?: (count: number) => void;
}

function layerStyle(color: string, weight: number, filled: boolean): L.PathOptions {
  return {
    color,
    weight,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: filled ? 0.15 : 0,
    lineCap: "round",
    lineJoin: "round",
  };
}

function findShapeAt(
  group: L.FeatureGroup,
  latlng: L.LatLng,
  map: L.Map,
): L.Layer | null {
  let hit: L.Layer | null = null;
  group.eachLayer((layer) => {
    if (hit) return;
    if (layer instanceof L.Marker) {
      const pt = map.latLngToLayerPoint(layer.getLatLng());
      const clickPt = map.latLngToLayerPoint(latlng);
      if (pt.distanceTo(clickPt) <= 14) hit = layer;
      return;
    }
    if (layer instanceof L.Circle) {
      if (layer.getLatLng().distanceTo(latlng) <= layer.getRadius()) hit = layer;
      return;
    }
    if (layer instanceof L.Rectangle || layer instanceof L.Polygon) {
      if ((layer as L.Polygon).getBounds().pad(0.02).contains(latlng)) hit = layer;
      return;
    }
    if (layer instanceof L.Polyline) {
      const bounds = layer.getBounds().pad(0.015);
      if (bounds.contains(latlng)) hit = layer;
    }
  });
  return hit;
}

export default function MapDrawingLayer({
  active,
  tool,
  color,
  strokeWidth = 3,
  undoSignal = 0,
  clearSignal = 0,
  onShapeCount,
}: Props) {
  const map = useMap();
  const groupRef = useRef<L.FeatureGroup | null>(null);
  const previewRef = useRef<L.Layer | null>(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef<L.LatLng[]>([]);
  const startRef = useRef<L.LatLng | null>(null);
  const prevUndo = useRef(undoSignal);
  const prevClear = useRef(clearSignal);

  const notifyCount = () => {
    onShapeCount?.(groupRef.current?.getLayers().length ?? 0);
  };

  useEffect(() => {
    const group = L.featureGroup().addTo(map);
    groupRef.current = group;
    notifyCount();
    return () => {
      group.remove();
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    if (undoSignal === prevUndo.current) return;
    prevUndo.current = undoSignal;
    const group = groupRef.current;
    if (!group) return;
    const layers = group.getLayers();
    const last = layers[layers.length - 1];
    if (last) {
      group.removeLayer(last);
      notifyCount();
    }
  }, [undoSignal]);

  useEffect(() => {
    if (clearSignal === prevClear.current) return;
    prevClear.current = clearSignal;
    groupRef.current?.clearLayers();
    notifyCount();
  }, [clearSignal]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const removePreview = () => {
      if (previewRef.current) {
        map.removeLayer(previewRef.current);
        previewRef.current = null;
      }
    };

    const finishShape = (layer: L.Layer) => {
      (layer as L.Path).setStyle?.({ interactive: true });
      if ("setZIndexOffset" in layer) {
        (layer as L.Marker).setZIndexOffset(800);
      }
      group.addLayer(layer);
      removePreview();
      notifyCount();
    };

    const addMarker = (latlng: L.LatLng) => {
      const icon = L.divIcon({
        className: "draw-marker-icon",
        html: `<span style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5);display:block;"></span>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      finishShape(L.marker(latlng, { icon, zIndexOffset: 800 }));
    };

    const onClick = (e: L.LeafletMouseEvent) => {
      if (!active) return;

      if (tool === "eraser") {
        L.DomEvent.stop(e);
        const hit = findShapeAt(group, e.latlng, map);
        if (hit) {
          group.removeLayer(hit);
          notifyCount();
        }
        return;
      }

      if (tool === "marker") {
        L.DomEvent.stop(e);
        addMarker(e.latlng);
        return;
      }

      if (tool === "polyline" || tool === "polygon") {
        L.DomEvent.stop(e);
        pointsRef.current.push(e.latlng);
        removePreview();
        if (pointsRef.current.length >= 2) {
          previewRef.current =
            tool === "polygon"
              ? L.polygon(pointsRef.current, layerStyle(color, strokeWidth, true))
              : L.polyline(pointsRef.current, layerStyle(color, strokeWidth, false));
          previewRef.current.addTo(map);
        }
        return;
      }
    };

    const onPointerDown = (e: L.LeafletMouseEvent) => {
      if (!active) return;
      if (tool === "eraser" || tool === "marker" || tool === "polyline" || tool === "polygon") return;

      L.DomEvent.stop(e);
      drawingRef.current = true;
      pointsRef.current = [e.latlng];
      startRef.current = e.latlng;
      map.dragging.disable();
      map.doubleClickZoom.disable();
    };

    const onPointerMove = (e: L.LeafletMouseEvent) => {
      if (!active || !drawingRef.current) return;

      const start = startRef.current;
      if (!start) return;

      removePreview();

      if (tool === "freehand") {
        const last = pointsRef.current[pointsRef.current.length - 1];
        if (!last || last.distanceTo(e.latlng) > 8) {
          pointsRef.current.push(e.latlng);
        }
        previewRef.current = L.polyline(pointsRef.current, layerStyle(color, strokeWidth, false));
      } else if (tool === "rectangle") {
        previewRef.current = L.rectangle(L.latLngBounds(start, e.latlng), layerStyle(color, strokeWidth, true));
      } else if (tool === "circle") {
        const radius = start.distanceTo(e.latlng);
        previewRef.current = L.circle(start, { radius, ...layerStyle(color, strokeWidth, true) });
      }

      if (previewRef.current) {
        previewRef.current.addTo(map);
      }
    };

    const onPointerUp = (e: L.LeafletMouseEvent) => {
      if (!active || !drawingRef.current) return;
      drawingRef.current = false;
      map.dragging.enable();
      map.doubleClickZoom.enable();

      const start = startRef.current;
      if (!start) return;

      if (tool === "freehand" && pointsRef.current.length >= 2) {
        finishShape(L.polyline(pointsRef.current, layerStyle(color, strokeWidth, false)));
      } else if (tool === "rectangle") {
        const bounds = L.latLngBounds(start, e.latlng);
        if (bounds.isValid() && start.distanceTo(e.latlng) > 1) {
          finishShape(L.rectangle(bounds, layerStyle(color, strokeWidth, true)));
        } else {
          removePreview();
        }
      } else if (tool === "circle") {
        const radius = start.distanceTo(e.latlng);
        if (radius > 1) {
          finishShape(L.circle(start, { radius, ...layerStyle(color, strokeWidth, true) }));
        } else {
          removePreview();
        }
      }

      pointsRef.current = [];
      startRef.current = null;
    };

    const onDblClick = (e: L.LeafletMouseEvent) => {
      if (!active || (tool !== "polyline" && tool !== "polygon")) return;
      L.DomEvent.stop(e);
      const minPts = tool === "polygon" ? 3 : 2;
      if (pointsRef.current.length >= minPts) {
        const pts = [...pointsRef.current];
        finishShape(
          tool === "polygon"
            ? L.polygon(pts, layerStyle(color, strokeWidth, true))
            : L.polyline(pts, layerStyle(color, strokeWidth, false)),
        );
        pointsRef.current = [];
      } else {
        removePreview();
        pointsRef.current = [];
      }
    };

    if (active) {
      const cursor =
        tool === "eraser" ? "crosshair" : tool === "marker" ? "pointer" : "crosshair";
      map.getContainer().style.cursor = cursor;
    } else {
      map.getContainer().style.cursor = "";
      drawingRef.current = false;
      removePreview();
    }

    map.on("click", onClick);
    map.on("mousedown", onPointerDown);
    map.on("mousemove", onPointerMove);
    map.on("mouseup", onPointerUp);
    map.on("dblclick", onDblClick);

    return () => {
      map.off("click", onClick);
      map.off("mousedown", onPointerDown);
      map.off("mousemove", onPointerMove);
      map.off("mouseup", onPointerUp);
      map.off("dblclick", onDblClick);
      map.getContainer().style.cursor = "";
      map.dragging.enable();
      map.doubleClickZoom.enable();
      removePreview();
    };
  }, [active, tool, color, strokeWidth, map]);

  return null;
}
