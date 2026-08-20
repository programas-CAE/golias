import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://golias:golias@localhost:5432/golias_test?schema=public";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const prismaBin = path.join(
  packageRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);

export function setup(): void {
  execFileSync(prismaBin, ["migrate", "deploy"], {
    cwd: packageRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
