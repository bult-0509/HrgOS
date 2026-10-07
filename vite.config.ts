import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["hrg-mark.svg"],
      manifest: {
        name: "HRG 国庆特别综艺",
        short_name: "HRG GAME",
        description: "HRG 线下综艺活动任务与工作人员控制台",
        theme_color: "#b91c1c",
        background_color: "#fff8f2",
        display: "standalone",
        orientation: "portrait",
        icons: [
          {
            src: "/hrg-mark.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
    watch: { ignored: ['**/local-private/**', '**/artifacts/**'] },
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/local-private/**", "**/失序重奏志愿分组与账号表-20261007.xlsx", "**/outputs/01a113e8-8714-78a3-ba2b-6836287a5e5f/**"]
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 3000
  }
});
