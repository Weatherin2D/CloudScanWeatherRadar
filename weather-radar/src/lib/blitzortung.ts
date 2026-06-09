/** Decode LZW-compressed Blitzortung WebSocket payloads to JSON text. */
export function blitzortungDecode(data: string): string {
  const e: Record<number, string> = {};
  const d = data.split("");
  let c = d[0];
  let f = c;
  const g: string[] = [c];
  let o = 256;

  for (let i = 1; i < d.length; i++) {
    const ao = d[i].charCodeAt(0);
    const a = ao < 256 ? d[i] : e[ao] ?? f + c;
    g.push(a);
    c = a[0];
    e[o] = f + c;
    o += 1;
    f = a;
  }

  return g.join("");
}

/** Binary WebSocket frames must be read as Latin-1, not UTF-8. */
export function binaryToLatin1String(data: ArrayBuffer | ArrayBufferView): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

export async function wsDataToString(data: string | Blob | ArrayBuffer): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return binaryToLatin1String(data);
  if (data instanceof Blob) {
    const buf = await data.arrayBuffer();
    return binaryToLatin1String(buf);
  }
  return "";
}

export function decodeBlitzortungPayload(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through */
    }
  }

  try {
    return JSON.parse(blitzortungDecode(trimmed));
  } catch {
    return null;
  }
}
