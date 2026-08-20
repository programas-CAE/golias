import os from "node:os";
import path from "node:path";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://golias:golias@localhost:5432/golias_test?schema=public";

// Evita que testes de upload gravem arquivos reais dentro do repositório.
process.env.UPLOADS_ROOT = path.join(os.tmpdir(), "golias-test-uploads");
