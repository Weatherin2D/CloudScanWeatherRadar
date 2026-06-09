import {
  Pencil, PenLine, Hexagon, Square, Circle, MapPin, Eraser,
  Undo2, Trash2, X,
} from "lucide-react";
import type { DrawTool } from "./MapDrawingLayer";

const TOOLS: { id: DrawTool; label: string; icon: typeof Pencil }[] = [
  { id: "freehand", label: "Freehand", icon: Pencil },
  { id: "polyline", label: "Line", icon: PenLine },
  { id: "polygon", label: "Polygon", icon: Hexagon },
  { id: "rectangle", label: "Rectangle", icon: Square },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "marker", label: "Marker", icon: MapPin },
  { id: "eraser", label: "Eraser", icon: Eraser },
];

const COLORS = [
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ffffff",
];

interface Props {
  tool: DrawTool;
  color: string;
  shapeCount: number;
  onToolChange: (tool: DrawTool) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onClose: () => void;
}

export default function DrawingToolbar({
  tool,
  color,
  shapeCount,
  onToolChange,
  onColorChange,
  onUndo,
  onClear,
  onClose,
}: Props) {
  return (
    <div className="pointer-events-auto bg-gray-900/95 backdrop-blur border border-gray-700 rounded-xl shadow-xl p-2 flex flex-col gap-2 min-w-[200px]">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Draw</span>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          title="Exit draw mode"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onToolChange(id)}
            title={label}
            className={`p-2 rounded-lg transition-colors ${
              tool === id
                ? "bg-amber-600/30 text-amber-300 border border-amber-500/50"
                : "text-gray-400 hover:text-white hover:bg-gray-800 border border-transparent"
            }`}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 px-1">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            title={c}
            className={`w-5 h-5 rounded-full border-2 transition-transform ${
              color === c ? "border-white scale-110" : "border-gray-600 hover:border-gray-400"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="flex items-center gap-1 border-t border-gray-800 pt-2">
        <button
          onClick={onUndo}
          disabled={shapeCount === 0}
          className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 disabled:opacity-30 transition-colors"
        >
          <Undo2 className="w-3.5 h-3.5" /> Undo
        </button>
        <button
          onClick={onClear}
          disabled={shapeCount === 0}
          className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-red-300 hover:bg-gray-800 disabled:opacity-30 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      <p className="text-[10px] text-gray-600 px-1 leading-snug">
        {tool === "polyline" || tool === "polygon"
          ? "Click and drag, or double-click to finish."
          : tool === "eraser"
            ? "Click a shape to remove it."
            : tool === "marker"
              ? "Click to place a marker."
              : "Click and drag on the map."}
      </p>
    </div>
  );
}
