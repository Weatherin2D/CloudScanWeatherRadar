import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { nexradLevel3Cjs } from "./viteNexradCjsPlugin";

const rawPort = process.env.PORT ?? "20405";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    nexradLevel3Cjs(),
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
        replacement: path.resolve(import.meta.dirname, "../lib/nexrad-browser/src/index.js"),
      },
      {
        find: /nexrad-level-3-data[\\/]src[\\/]randomaccessfile(?:[\\/]index\.js)?$/,
        replacement: path.resolve(import.meta.dirname, "../lib/nexrad-browser/src/randomaccessfile.js"),
      },
      {
        find: /nexrad-level-3-data[\\/]src[\\/]packets[\\/]index\.js$/,
        replacement: path.resolve(import.meta.dirname, "../lib/nexrad-browser/src/packets.js"),
      },
      {
        find: /nexrad-level-3-data[\\/]src[\\/]products[\\/]index\.js$/,
        replacement: path.resolve(import.meta.dirname, "../lib/nexrad-browser/src/products.js"),
      },
    ],
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["buffer", "seek-bzip", "h5wasm"],
  },
  build: {
    commonjsOptions: {
      include: [/nexrad-level-3-data/, /node_modules/],
      transformMixedEsModules: true,
    },
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  root: path.resolve(import.meta.dirname),
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
      "/api/ifrc-alerts": {
        target: "https://alerthub-api.ifrc.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/ifrc-alerts/, "/graphql"),
      },
      "/api/mesocast": {
        target: "https://mesocast.uk",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/mesocast/, ""),
      },
      "/api/open-meteo": {
        target: "https://api.open-meteo.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/open-meteo/, ""),
      },
      "/api/stormforecast": {
        target: "https://stormforecast.eu",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/stormforecast/, ""),
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
