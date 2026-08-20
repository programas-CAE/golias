import { defineConfig, env } from "prisma/config";
import { loadEnv } from "./src/lib/loadEnv.js";

loadEnv(".env", import.meta.url);

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
