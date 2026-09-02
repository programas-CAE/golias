import type { FastifyInstance } from "fastify";
import { LINK_CAMPO_DIAS_VALIDADE } from "./rdos.js";
import { comCodigoRastreio } from "../lib/codigoRastreio.js";
import { prisma } from "../lib/prisma.js";
import { generateToken } from "../lib/tokens.js";

async function buscarFrentePorToken(token: string) {
  return prisma.frente.findUnique({
    where: { portalEncarregadoToken: token },
    select: { id: true, nome: true, codigo: true },
  });
}

const membroSelect = {
  id: true,
  colaboradorId: true,
  colaborador: { select: { id: true, nome: true } },
  funcaoId: true,
  funcao: { select: { id: true, nome: true } },
  quantidade: true,
} as const;

const equipeSelect = {
  id: true,
  nome: true,
  encarregadoId: true,
  membros: { select: membroSelect },
} as const;

/** Início (00:00) do dia local de hoje, pra filtrar/gravar o Rdo de "hoje". */
function inicioDeHoje(): Date {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/** Reaproveitado pela rota de token (portal fixo) e pela autenticada (routes/encarregado.ts). */
export async function listarDistritosDaFrente(frenteId: string) {
  const [distritos, funcoes, colaboradores] = await Promise.all([
    prisma.distrito.findMany({
      where: { frenteId, ativo: true },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        equipes: { where: { ativo: true }, orderBy: { nome: "asc" }, select: equipeSelect },
      },
    }),
    prisma.funcaoCatalogo.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.colaborador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, funcaoId: true } }),
  ]);
  return { distritos, funcoes, colaboradores };
}

interface CriarOuAcharRdoHojeInput {
  frenteId: string;
  equipeId: string;
  encarregadoId?: string | null;
  tipo?: "PREVENTIVA_CORRETIVA" | "TERRAPLENAGEM" | "SUPERESTRUTURA";
}

/**
 * Acha o RDO de hoje da equipe (se o encarregado já começou) ou cria um
 * rascunho novo — e devolve o id + token de campo pra abrir a tela de
 * lançamento, igual ao que `POST /rdos` já faz pro escritório, só que sem
 * duplicar RDO a cada visita no mesmo dia.
 */
export async function criarOuAcharRdoHoje({ frenteId, equipeId, encarregadoId, tipo }: CriarOuAcharRdoHojeInput) {
  const hoje = inicioDeHoje();
  const amanha = new Date(hoje.getTime() + 24 * 60 * 60 * 1000);

  const existente = await prisma.rdo.findFirst({
    where: { equipeId, data: { gte: hoje, lt: amanha } },
    orderBy: { criadoEm: "desc" },
    select: { id: true, linkCampoToken: true, tipo: true },
  });
  if (existente?.linkCampoToken) {
    return existente;
  }

  const linkCampoExpiraEm = new Date();
  linkCampoExpiraEm.setDate(linkCampoExpiraEm.getDate() + LINK_CAMPO_DIAS_VALIDADE);

  return comCodigoRastreio((codigoRastreio) =>
    prisma.rdo.create({
      data: {
        frenteId,
        equipeId,
        data: hoje,
        codigoRastreio,
        encarregadoId: encarregadoId ?? null,
        tipo,
        linkCampoToken: generateToken(),
        linkCampoExpiraEm,
      },
      select: { id: true, linkCampoToken: true, tipo: true },
    }),
  );
}

export function registerPortalEncarregadoRoutes(app: FastifyInstance): void {
  /**
   * Portal fixo do encarregado, por frente (mesma filosofia do portal do
   * fiscal) — ele escolhe o distrito e a equipe (o navegador lembra a
   * última via localStorage) em vez de depender do escritório criar um RDO
   * e mandar um link de campo toda vez.
   */
  app.get<{ Params: { token: string } }>("/portal-encarregado/:token", async (request, reply) => {
    const frente = await buscarFrentePorToken(request.params.token);
    if (!frente) return reply.status(404).send({ error: "Link inválido" });

    const { distritos, funcoes, colaboradores } = await listarDistritosDaFrente(frente.id);
    return { frente, distritos, funcoes, colaboradores };
  });

  /**
   * Cria uma equipe nova dentro de um distrito dessa frente ("montar
   * equipe") — as ações de editar o efetivo (add/remove membro) reusam as
   * rotas gerais de /equipes, já que não têm nenhuma checagem de login pra
   * burlar; só a criação/leitura da lista aqui precisa ficar restrita à
   * frente do token.
   */
  app.post<{ Params: { token: string }; Body: { nome: string; distritoId: string } }>(
    "/portal-encarregado/:token/equipes",
    async (request, reply) => {
      const frente = await buscarFrentePorToken(request.params.token);
      if (!frente) return reply.status(404).send({ error: "Link inválido" });

      const nome = String(request.body?.nome ?? "").trim();
      const distritoId = String(request.body?.distritoId ?? "");
      if (!nome) return reply.status(400).send({ error: "Informe o nome da equipe" });

      const distrito = await prisma.distrito.findUnique({ where: { id: distritoId }, select: { frenteId: true } });
      if (!distrito || distrito.frenteId !== frente.id) {
        return reply.status(400).send({ error: "Distrito inválido" });
      }

      const equipe = await prisma.equipe.create({ data: { nome, distritoId }, select: equipeSelect });
      return reply.status(201).send(equipe);
    },
  );

  /**
   * Acha o RDO de hoje da equipe (se o encarregado já começou) ou cria um
   * rascunho novo — e devolve o token de campo pra abrir a tela de
   * lançamento, igual ao que `POST /rdos` já faz pro escritório, só que
   * sem duplicar RDO a cada visita ao portal no mesmo dia.
   */
  app.post<{ Params: { token: string; equipeId: string } }>(
    "/portal-encarregado/:token/equipes/:equipeId/rdo-hoje",
    async (request, reply) => {
      const frente = await buscarFrentePorToken(request.params.token);
      if (!frente) return reply.status(404).send({ error: "Link inválido" });

      const equipe = await prisma.equipe.findUnique({
        where: { id: request.params.equipeId },
        select: { id: true, distrito: { select: { frenteId: true } } },
      });
      if (!equipe || equipe.distrito.frenteId !== frente.id) {
        return reply.status(404).send({ error: "Equipe não encontrada" });
      }

      const rdo = await criarOuAcharRdoHoje({ frenteId: frente.id, equipeId: equipe.id });
      return reply.status(201).send({ linkCampoToken: rdo.linkCampoToken });
    },
  );
}
