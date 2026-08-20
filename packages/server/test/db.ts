import { afterAll } from "vitest";
import { prisma } from "../src/lib/prisma.js";

/** Esvazia todas as tabelas do schema de teste entre casos de teste. */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;

  const names = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

// Registrado aqui (em vez de em cada arquivo de teste) para que todo arquivo
// que importa resetDatabase feche automaticamente o pool de conexões do
// Postgres ao final — cada arquivo de teste tem seu próprio módulo isolado
// (e portanto seu próprio pool), então isso não afeta outros arquivos.
afterAll(async () => {
  await prisma.$disconnect();
});
