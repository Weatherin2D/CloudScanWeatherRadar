/** Normalize CJS `module.exports` when bundled for the browser. */
export function cjs(mod) {
  if (mod == null) return mod;
  if (mod.default != null && typeof mod.default === "object") return mod.default;
  if (mod.default != null && typeof mod.default === "function") return mod.default;
  return mod;
}
