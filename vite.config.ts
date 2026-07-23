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
      includeAssets: ["favicon.svg", "icons/icon.svg", "icons/icon-maskable.svg"],
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
        icons: [
          {
            src: "icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icons/icon-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
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
