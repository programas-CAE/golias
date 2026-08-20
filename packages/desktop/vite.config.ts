import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" garante que os assets gerados usem caminhos relativos, já que
// em produção o Electron carrega dist/index.html via file://, onde caminhos
// absolutos (iniciados em "/") não resolvem para o diretório correto.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: "dist",
  },
});
