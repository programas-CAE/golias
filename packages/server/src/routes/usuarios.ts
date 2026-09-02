import { usuarioCreateInputSchema, usuarioUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { hashSenha } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

/**
 * Cadastro de fiscal/encarregado (tela "Cadastro" do escritório) — CRUD de
 * `Usuario`. Sem guard: o app desktop (quem chama isso) não tem login,
 * mesma situação de todas as outras rotas usadas só pelo escritório.
 */
const usuarioSelect = {
  id: true,
  nome: true,
  email: true,
  matriculaLogin: true,
  role: true,
  ativo: true,
  frenteId: true,
  frente: { select: { id: true, nome: true } },
  colaboradorId: true,
  colaborador: { select: { id: true, nome: true, matricula: true } },
} as const;

export function registerUsuariosRoutes(app: FastifyInstance): void {
  app.get("/usuarios", async () => {
    return prisma.usuario.findMany({ orderBy: { nome: "asc" }, select: usuarioSelect });
  });

  app.post("/usuarios", async (request, reply) => {
    const data = parseBody(usuarioCreateInputSchema, request.body, reply);
    if (!data) return;

    let matriculaLogin: string | null = null;
    if (data.role === "ENCARREGADO" && data.colaboradorId) {
      const colaborador = await prisma.colaborador.findUnique({ where: { id: data.colaboradorId } });
      if (!colaborador) return reply.status(400).send({ error: "Colaborador informado não existe" });
      matriculaLogin = colaborador.matricula;
    }

    try {
      const usuario = await prisma.usuario.create({
        data: {
          nome: data.nome,
          email: data.email ?? null,
          matriculaLogin,
          senhaHash: await hashSenha(data.senha),
          role: data.role,
          frenteId: data.frenteId ?? null,
          colaboradorId: data.role === "ENCARREGADO" ? (data.colaboradorId ?? null) : null,
          ativo: data.ativo,
        },
        select: usuarioSelect,
      });
      return await reply.status(201).send(usuario);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe um usuário com esse e-mail ou colaborador" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Frente ou colaborador informado não existe" });
        }
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/usuarios/:id", async (request, reply) => {
    const data = parseBody(usuarioUpdateInputSchema, request.body, reply);
    if (!data) return;

    const existente = await prisma.usuario.findUnique({ where: { id: request.params.id } });
    if (!existente) return reply.status(404).send({ error: "Usuário não encontrado" });

    let matriculaLogin: string | null | undefined;
    if (data.colaboradorId !== undefined) {
      if (data.colaboradorId === null) {
        matriculaLogin = null;
      } else {
        const colaborador = await prisma.colaborador.findUnique({ where: { id: data.colaboradorId } });
        if (!colaborador) return reply.status(400).send({ error: "Colaborador informado não existe" });
        matriculaLogin = colaborador.matricula;
      }
    }

    try {
      const usuario = await prisma.usuario.update({
        where: { id: request.params.id },
        data: {
          nome: data.nome,
          email: data.email,
          colaboradorId: data.colaboradorId,
          matriculaLogin,
          frenteId: data.frenteId,
          ativo: data.ativo,
          ...(data.senha ? { senhaHash: await hashSenha(data.senha) } : {}),
        },
        select: usuarioSelect,
      });
      return usuario;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") return reply.status(404).send({ error: "Usuário não encontrado" });
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe um usuário com esse e-mail ou colaborador" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Frente ou colaborador informado não existe" });
        }
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>("/usuarios/:id", async (request, reply) => {
    try {
      await prisma.usuario.delete({ where: { id: request.params.id } });
      return reply.status(204).send();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return reply.status(404).send({ error: "Usuário não encontrado" });
      }
      throw error;
    }
  });
}
