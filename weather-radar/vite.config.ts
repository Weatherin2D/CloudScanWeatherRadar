import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "20405";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
      {
        find: "@assets",
        replacement: path.resolve(import.meta.dirname, "..", "attached_assets"),
      },
      { find: "buffer", replacement: "buffer/" },
      {
        find: /^nexrad-level-3-data$/,
        replacement: path.resolve(import.meta.dirname, "src/lib/nexradBrowser/index.js"),
      },
      {
        find: /nexrad-level-3-data[\\/]src[\\/]packets[\\/]index\.js$/,
        replacement: path.resolve(import.meta.dirname, "src/lib/nexradBrowser/packets.js"),
      },
      {
        find: /nexrad-level-3-data[\\/]src[\\/]products[\\/]index\.js$/,
        replacement: path.resolve(import.meta.dirname, "src/lib/nexradBrowser/products.js"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["buffer", "seek-bzip", "h5wasm"],
    exclude: ["nexrad-level-3-data"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api/nexrad-l3": {
        target: "https://unidata-nexrad-level3.s3.amazonaws.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/nexrad-l3/, ""),
      },
      "/api/meteogate": {
        target: "https://api.meteogate.eu",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/meteogate/, ""),
      },
      "/api/openradar": {
        target: "https://s3.waw3-1.cloudferro.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/openradar/, ""),
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
