import { RDO_TIPO_VALUES } from "@golias/shared";
import type { FastifyInstance } from "fastify";
import { exigirRole } from "../lib/authGuard.js";
import { prisma } from "../lib/prisma.js";
import { criarOuAcharRdoHoje, listarDistritosDaFrente } from "./portalEncarregado.js";

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
    return { frente, distritos, funcoes, colaboradores };
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

    const equipe = await prisma.equipe.create({ data: { nome, distritoId }, select: { id: true, nome: true } });
    return reply.status(201).send(equipe);
  });

  app.post<{ Body: { equipeId: string; tipo?: string } }>("/encarregado/rdo-hoje", async (request, reply) => {
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

    const rdo = await criarOuAcharRdoHoje({
      frenteId: usuario.frenteId,
      equipeId: equipe.id,
      encarregadoId: usuario.colaboradorId,
      tipo,
    });
    return reply.status(201).send(rdo);
  });
}
