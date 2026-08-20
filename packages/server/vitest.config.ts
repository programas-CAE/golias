import { defineConfig } from "vitest/config";

// fileParallelism: false porque os testes de integração compartilham um
// único banco Postgres de teste (golias_test) e fazem TRUNCATE entre casos
// — rodar arquivos em paralelo causaria condições de corrida entre eles.
export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./test/globalSetup.ts"],
    setupFiles: ["./test/setupEnv.ts"],
    fileParallelism: false,
  },
});
