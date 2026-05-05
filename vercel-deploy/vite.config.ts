/**
 * Vercel deployment vite config.
 *
 * INSTRUCTIONS:
 *   1. In your local GitHub clone, run: npm install nitro
 *   2. Copy this file to the project root, replacing the existing vite.config.ts
 *   3. Delete wrangler.jsonc
 *   4. Push to GitHub → Vercel auto-deploys
 *
 * DO NOT use this inside Lovable — it will break the sandbox preview.
 */
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart(),
    nitro({ preset: "vercel" }),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
});
