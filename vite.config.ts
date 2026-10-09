import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages 部署在仓库子路径时,通过 DEPLOY_BASE 指定,例如 /pdf-maker/
const base = process.env.DEPLOY_BASE || "/";

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
    // packages/zcode-plugin 自带一份 react/scheduler,若不加去重,
    // dev 预构建会混入两套 React 实例,导致 "Cannot read properties of
    // null (reading 'useState')" 崩溃
    dedupe: ["react", "react-dom", "react-dom/client", "scheduler"],
  },
});
