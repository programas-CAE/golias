import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export function registerEquipamentosRoutes(app: FastifyInstance): void {
  app.get("/equipamentos", async () => {
    return prisma.equipamentoCatalogo.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    });
  });
}
