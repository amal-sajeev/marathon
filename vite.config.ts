import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the app works on GitHub Pages project subpaths
// (e.g. https://user.github.io/RPGtask/) as well as at a domain root.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // icon.svg is still the Welcome crest; the old maskable SVG is unused now
      // that the manifest points at Leela's raster icons.
      includeAssets: ["favicon.svg", "icons/icon.svg"],
      manifest: {
        name: "Marathon",
        short_name: "Marathon",
        description:
          "A sci-fi RPG task keeper with an AI companion who sets your quests.",
        theme_color: "#000206",
        background_color: "#000206",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        scope: ".",
        // Leela's face is the home-screen icon. Raster only: the maskable variant
        // needs a real safe-zone inset, and iOS ignores SVG entirely.
        icons: [
          {
            src: "icons/leela-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/leela-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/leela-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          { name: "Quick add", short_name: "Add", url: "./#add" },
          { name: "Talk to Leela", short_name: "Leela", url: "./#chat" },
          { name: "Check in now", short_name: "Check in", url: "./#checkin" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // Leela's face/background art can be large and numerous - keep it out
        // of the install-time precache and cache each image on first use so the
        // app installs small and stays fast.
        globIgnores: ["**/assets/faces/**"],
        importScripts: ["notify-sw.js"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/assets/faces/"),
            handler: "CacheFirst",
            options: {
              cacheName: "leela-faces",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
