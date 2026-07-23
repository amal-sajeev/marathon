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
        importScripts: ["notify-sw.js"],
      },
    }),
  ],
});
