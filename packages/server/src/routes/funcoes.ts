import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export function registerFuncoesRoutes(app: FastifyInstance): void {
  app.get("/funcoes", async () => {
    return prisma.funcaoCatalogo.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    });
  });
}
