import { RDO_TIPO_VALUES, equipeMembroInputSchema, equipeMembroUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { exigirRole } from "../lib/authGuard.js";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";
import { criarOuAcharRdoHoje, listarDistritosDaFrente } from "./portalEncarregado.js";

const membroSelect = {
  id: true,
  colaboradorId: true,
  colaborador: { select: { id: true, nome: true } },
  funcaoId: true,
  funcao: { select: { id: true, nome: true } },
  quantidade: true,
} as const;

/**
 * Confirma que a equipe existe e pertence à frente do encarregado logado —
 * as rotas de membro em equipes.ts (usadas pelo desktop) não têm essa
 * checagem porque o desktop não tem login; aqui, autenticado, um
 * encarregado só pode mexer nas equipes da própria frente, nunca de outra.
 */
async function equipeDaFrente(equipeId: string, frenteId: string): Promise<boolean> {
  const equipe = await prisma.equipe.findUnique({ where: { id: equipeId }, select: { distrito: { select: { frenteId: true } } } });
  return equipe?.distrito.frenteId === frenteId;
}

/**
 * Portal do encarregado por login (substitui o link público por frente) —
 * o RDO do dia já nasce com `encarregadoId` do usuário logado (antes disso
 * o fluxo por link não capturava identidade nenhuma) e com o `tipo`
 * escolhido na hora (Preventiva/Corretiva, Terraplenagem ou Superestrutura).
 */
export function registerEncarregadoRoutes(app: FastifyInstance): void {
  app.get("/encarregado/equipes", async (request, reply) => {
    const usuario = await exigirRole(["ENCARREGADO"])(request, reply);
    if (!usuario) return;
    if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });

    const frente = await prisma.frente.findUnique({ where: { id: usuario.frenteId }, select: { id: true, nome: true, codigo: true } });
    if (!frente) return reply.status(404).send({ error: "Frente não encontrada" });

    const { distritos, funcoes, colaboradores } = await listarDistritosDaFrente(frente.id);
    // Obras ativas, pra ele escolher qual projeto o RDO de hoje pertence —
    // lista global (Obra não é escopada por frente, uma obra pode ter
    // equipes de frentes diferentes trabalhando nela).
    const obras = await prisma.obra.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } });
    return { frente, distritos, funcoes, colaboradores, obras };
  });

  app.post<{ Body: { nome: string; distritoId: string } }>("/encarregado/equipes", async (request, reply) => {
    const usuario = await exigirRole(["ENCARREGADO"])(request, reply);
    if (!usuario) return;
    if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });

    const nome = String(request.body?.nome ?? "").trim();
    const distritoId = String(request.body?.distritoId ?? "");
    if (!nome) return reply.status(400).send({ error: "Informe o nome da equipe" });

    const distrito = await prisma.distrito.findUnique({ where: { id: distritoId }, select: { frenteId: true } });
    if (!distrito || distrito.frenteId !== usuario.frenteId) {
      return reply.status(400).send({ error: "Distrito inválido" });
    }

    const equipe = await prisma.equipe.create({
      // Quem cria já entra como encarregado dela — "a equipe dele".
      data: { nome, distritoId, encarregadoId: usuario.colaboradorId },
      select: { id: true, nome: true },
    });
    return reply.status(201).send(equipe);
  });

  /**
   * Efetivo da equipe (membros) — mesmas regras de equipes.ts (usadas pelo
   * desktop), mas só dentro da frente do encarregado logado.
   */
  app.post<{ Params: { id: string } }>("/encarregado/equipes/:id/membros", async (request, reply) => {
    const usuario = await exigirRole(["ENCARREGADO"])(request, reply);
    if (!usuario) return;
    if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });
    if (!(await equipeDaFrente(request.params.id, usuario.frenteId))) {
      return reply.status(404).send({ error: "Equipe não encontrada" });
    }

    const data = parseBody(equipeMembroInputSchema, request.body, reply);
    if (!data) return;

    try {
      const membro = await prisma.equipeMembro.create({ data: { ...data, equipeId: request.params.id }, select: membroSelect });
      return await reply.status(201).send(membro);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") return reply.status(409).send({ error: "Colaborador já faz parte desta equipe" });
        if (error.code === "P2003") return reply.status(400).send({ error: "Função ou colaborador inválidos" });
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string; membroId: string } }>(
    "/encarregado/equipes/:id/membros/:membroId",
    async (request, reply) => {
      const usuario = await exigirRole(["ENCARREGADO"])(request, reply);
      if (!usuario) return;
      if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });
      if (!(await equipeDaFrente(request.params.id, usuario.frenteId))) {
        return reply.status(404).send({ error: "Equipe não encontrada" });
      }

      const data = parseBody(equipeMembroUpdateInputSchema, request.body, reply);
      if (!data) return;

      const { count } = await prisma.equipeMembro.updateMany({
        where: { id: request.params.membroId, equipeId: request.params.id },
        data,
      });
      if (count === 0) return reply.status(404).send({ error: "Membro não encontrado" });
      return prisma.equipeMembro.findUniqueOrThrow({ where: { id: request.params.membroId }, select: membroSelect });
    },
  );

  app.delete<{ Params: { id: string; membroId: string } }>(
    "/encarregado/equipes/:id/membros/:membroId",
    async (request, reply) => {
      const usuario = await exigirRole(["ENCARREGADO"])(request, reply);
      if (!usuario) return;
      if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });
      if (!(await equipeDaFrente(request.params.id, usuario.frenteId))) {
        return reply.status(404).send({ error: "Equipe não encontrada" });
      }

      const { count } = await prisma.equipeMembro.deleteMany({
        where: { id: request.params.membroId, equipeId: request.params.id },
      });
      if (count === 0) return reply.status(404).send({ error: "Membro não encontrado" });
      return reply.status(204).send();
    },
  );

  app.post<{ Body: { equipeId: string; tipo?: string; obraId?: string | null } }>(
    "/encarregado/rdo-hoje",
    async (request, reply) => {
      const usuario = await exigirRole(["ENCARREGADO"])(request, reply);
      if (!usuario) return;
      if (!usuario.frenteId) return reply.status(400).send({ error: "Usuário sem frente cadastrada" });

      const equipeId = String(request.body?.equipeId ?? "");
      const tipoBody = request.body?.tipo;
      const tipo = (RDO_TIPO_VALUES as readonly string[]).includes(tipoBody ?? "")
        ? (tipoBody as (typeof RDO_TIPO_VALUES)[number])
        : undefined;
      if (!equipeId) return reply.status(400).send({ error: "Informe a equipe" });

      const equipe = await prisma.equipe.findUnique({
        where: { id: equipeId },
        select: { id: true, distrito: { select: { frenteId: true } } },
      });
      if (!equipe || equipe.distrito.frenteId !== usuario.frenteId) {
        return reply.status(404).send({ error: "Equipe não encontrada" });
      }

      const obraId = request.body?.obraId || null;
      if (obraId && !(await prisma.obra.findUnique({ where: { id: obraId }, select: { id: true } }))) {
        return reply.status(400).send({ error: "Obra inválida" });
      }

      const rdo = await criarOuAcharRdoHoje({
        frenteId: usuario.frenteId,
        equipeId: equipe.id,
        encarregadoId: usuario.colaboradorId,
        tipo,
        obraId,
      });
      return reply.status(201).send(rdo);
    },
  );
}
