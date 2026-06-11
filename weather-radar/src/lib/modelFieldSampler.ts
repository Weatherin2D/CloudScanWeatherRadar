import { cellValuesAtHour, type ModelGridData } from "@/lib/modelGrid";

function idx(row: number, col: number, cols: number): number {
  return row * cols + col;
}

/** Meteorological wind direction (from) → u/v in km/h (east/north). */
export function windToUV(speed: number, directionDeg: number): [number, number] {
  const rad = (directionDeg * Math.PI) / 180;
  const u = -speed * Math.sin(rad);
  const v = -speed * Math.cos(rad);
  return [u, v];
}

export class ModelFieldSampler {
  readonly rows: number;
  readonly cols: number;
  readonly south: number;
  readonly north: number;
  readonly west: number;
  readonly east: number;
  readonly latStep: number;
  readonly lonStep: number;

  private scalar: Float32Array;
  private speed: Float32Array | null = null;
  private u: Float32Array | null = null;
  private v: Float32Array | null = null;
  private extra: Map<string, Float32Array> = new Map();

  constructor(data: ModelGridData, hourIndex: number, scalarParam: string, wind = false) {
    this.rows = data.rows;
    this.cols = data.cols;
    this.south = data.south;
    this.north = data.north;
    this.west = data.west;
    this.east = data.east;
    this.latStep = data.latStep;
    this.lonStep = data.lonStep;

    const n = this.rows * this.cols;
    this.scalar = new Float32Array(n).fill(NaN);

    if (wind) {
      this.speed = new Float32Array(n).fill(NaN);
      this.u = new Float32Array(n).fill(NaN);
      this.v = new Float32Array(n).fill(NaN);
      const speedKey = scalarParam;
      const dirKey = speedKey.replace("wind_speed_", "wind_direction_");
      for (const cell of data.cells) {
        const i = idx(cell.row, cell.col, this.cols);
        const values = cellValuesAtHour(cell, hourIndex, data.hourlyParams);
        const sp = values[speedKey];
        const dir = values[dirKey];
        if (sp == null || dir == null) continue;
        this.speed[i] = sp;
        const [uu, vv] = windToUV(sp, dir);
        this.u![i] = uu;
        this.v![i] = vv;
        this.scalar[i] = sp;
      }
    } else {
      for (const cell of data.cells) {
        const i = idx(cell.row, cell.col, this.cols);
        const values = cellValuesAtHour(cell, hourIndex, [scalarParam]);
        const v = values[scalarParam];
        if (v != null) this.scalar[i] = v;
      }
    }
  }

  addExtraField(data: ModelGridData, hourIndex: number, param: string): void {
    const arr = new Float32Array(this.rows * this.cols).fill(NaN);
    for (const cell of data.cells) {
      const i = idx(cell.row, cell.col, this.cols);
      const values = cellValuesAtHour(cell, hourIndex, [param]);
      const v = values[param];
      if (v != null) arr[i] = v;
    }
    this.extra.set(param, arr);
  }

  extraField(param: string): Float32Array | undefined {
    return this.extra.get(param);
  }

  contains(lat: number, lon: number): boolean {
    if (lat < this.south || lat > this.north) return false;
    if (this.east >= this.west) {
      return lon >= this.west && lon <= this.east;
    }
    return lon >= this.west || lon <= this.east;
  }

  private gridCoords(lat: number, lon: number): [number, number] {
    const rowF = this.rows <= 1 ? 0 : ((lat - this.south) / this.latStep);
    const lonNorm = normalizeLonInBounds(lon, this.west, this.east);
    const colF = this.cols <= 1 ? 0 : ((lonNorm - this.west) / this.lonStep);
    return [rowF, colF];
  }

  sampleScalar(lat: number, lon: number): number | null {
    return bilinear(this.scalar, this.rows, this.cols, ...this.gridCoords(lat, lon));
  }

  sampleUV(lat: number, lon: number): [number, number] | null {
    if (!this.u || !this.v) return null;
    const u = bilinear(this.u, this.rows, this.cols, ...this.gridCoords(lat, lon));
    const v = bilinear(this.v, this.rows, this.cols, ...this.gridCoords(lat, lon));
    if (u == null || v == null) return null;
    return [u, v];
  }

  sampleExtra(param: string, lat: number, lon: number): number | null {
    const field = this.extra.get(param);
    if (!field) return null;
    return bilinear(field, this.rows, this.cols, ...this.gridCoords(lat, lon));
  }
}

function normalizeLonInBounds(lon: number, west: number, east: number): number {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  if (east >= west) return x;
  if (x < 0 && west > 0) return x;
  return x;
}

function bilinear(
  field: Float32Array,
  rows: number,
  cols: number,
  rowF: number,
  colF: number,
): number | null {
  if (rows === 0 || cols === 0) return null;

  const r0 = Math.floor(rowF);
  const c0 = Math.floor(colF);
  const r1 = Math.min(rows - 1, r0 + 1);
  const c1 = Math.min(cols - 1, c0 + 1);
  const tr = rowF - r0;
  const tc = colF - c0;

  const v00 = field[idx(r0, c0, cols)];
  const v01 = field[idx(r0, c1, cols)];
  const v10 = field[idx(r1, c0, cols)];
  const v11 = field[idx(r1, c1, cols)];

  const samples = [v00, v01, v10, v11];
  if (samples.every((v) => Number.isNaN(v))) return null;

  const fill = (v: number) => (Number.isNaN(v) ? 0 : v);
  const a = fill(v00) * (1 - tr) + fill(v10) * tr;
  const b = fill(v01) * (1 - tr) + fill(v11) * tr;
  return a * (1 - tc) + b * tc;
}

export function particleCountForSize(width: number, height: number): number {
  return Math.min(3500, Math.max(800, Math.floor((width * height) / 500)));
}

export interface WindParticle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

export function spawnParticle(width: number, height: number): WindParticle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    age: 0,
    maxAge: 40 + Math.random() * 60,
  };
}
