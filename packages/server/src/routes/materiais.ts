import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export function registerMateriaisRoutes(app: FastifyInstance): void {
  app.get("/materiais", async () => {
    return prisma.materialCatalogo.findMany({
      where: { ativo: true },
      orderBy: { descricao: "asc" },
      select: { id: true, codigo: true, descricao: true, unidade: true, precoUnitario: true },
    });
  });
}
