import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pngPath = path.join(__dirname, "../tmp-n0q.png");
const outPath = path.join(__dirname, "../src/lib/iemColormap.ts");

const buf = fs.readFileSync(pngPath);
let pos = 8;
const plte = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  pos += 4;
  const type = buf.toString("ascii", pos, pos + 4);
  pos += 4;
  if (type === "PLTE") {
    for (let i = 0; i < len; i += 3) {
      plte.push([buf[pos + i], buf[pos + i + 1], buf[pos + i + 2]]);
    }
    break;
  }
  pos += len + 4;
}

if (plte.length !== 256) throw new Error(`Expected 256 PLTE entries, got ${plte.length}`);

const rgbLines = plte.map(([r, g, b]) => `  [${r}, ${g}, ${b}],`).join("\n");

const content = `/** IEM NEXRAD N0Q/N0B reflectivity palette (256 RGB entries, 0.5 dBZ steps). */
import { colorAtDbz, type ColorStop } from "./palPalette";

/** Standard IEM 8-bit reflectivity colours (index 0 = missing). */
export const IEM_NEXRAD_RGB: readonly [number, number, number][] = [
${rgbLines}
] as const;

/** Palette index to reflectivity (dBZ); index 0 is missing/no-data. */
export function iemIndexToDbz(index: number): number | null {
  if (index <= 0) return null;
  return -32 + (index - 1) * 0.5;
}

const RGB_TO_IEM_INDEX = new Map<number, number>();
for (let i = 0; i < IEM_NEXRAD_RGB.length; i++) {
  const [r, g, b] = IEM_NEXRAD_RGB[i];
  RGB_TO_IEM_INDEX.set((r << 16) | (g << 8) | b, i);
}

/** Map an IEM ridge tile RGB pixel to its palette index (exact match). */
export function iemRgbToIndex(r: number, g: number, b: number): number {
  return RGB_TO_IEM_INDEX.get((r << 16) | (g << 8) | b) ?? 0;
}

/** LUT indexed by IEM palette index → custom RadarScope palette colour. */
export function stopsToIemIndexLUT(stops: ColorStop[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const dbz = iemIndexToDbz(i);
    const o = i * 4;
    if (dbz === null) {
      lut[o + 3] = 0;
      continue;
    }
    const [r, g, b, a] = colorAtDbz(dbz, stops);
    lut[o] = r;
    lut[o + 1] = g;
    lut[o + 2] = b;
    lut[o + 3] = a;
  }
  return lut;
}
`;

fs.writeFileSync(outPath, content);
console.log("Wrote", outPath);
