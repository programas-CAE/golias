import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export function registerContratosRoutes(app: FastifyInstance): void {
  app.get("/contratos", async () => {
    return prisma.contrato.findMany({
      where: { ativo: true },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true, nome: true },
    });
  });
}
