import { ordemManutencaoCreateInputSchema, ordemManutencaoUpdateInputSchema } from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { extrairOrdensDoPdf } from "../lib/omPdfParser.js";
import { prisma } from "../lib/prisma.js";
import { parseBody } from "../lib/validate.js";

/** Tamanho máximo maior que o padrão global (anexos de RDO) — um relatório
 * de OM em lote (várias ordens, ~6-7 páginas cada) passa fácil de 15MB. */
const LIMITE_PDF_IMPORTACAO = 30 * 1024 * 1024;

const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"] as const;

type StatusFarol = "realizada" | "aguardandoValidacao" | "reprovada" | "pendente" | "naoExecutada";

const STATUS_FAROL_ZERADO: Record<StatusFarol, number> = {
  realizada: 0,
  aguardandoValidacao: 0,
  reprovada: 0,
  pendente: 0,
  naoExecutada: 0,
};

/**
 * OM não tem status próprio — é derivado do(s) RDO(s) que lançaram
 * atividade nela (via RdoAtividade.ordemManutencaoId). Uma mesma OM pode,
 * na teoria, ter mais de um RDO vinculado (retrabalho, correção); a que
 * "vence" segue a ordem: aprovado > em andamento > reprovado > sem RDO.
 */
function derivarStatusFarol(statusDosRdos: string[], dataEmissao: Date, hoje: Date): StatusFarol {
  if (statusDosRdos.includes("APROVADO")) return "realizada";
  if (statusDosRdos.some((s) => s === "RASCUNHO" || s === "EM_CORRECAO" || s === "AGUARDANDO_APROVACAO")) {
    return "aguardandoValidacao";
  }
  if (statusDosRdos.includes("REPROVADO")) return "reprovada";
  return dataEmissao.getTime() <= hoje.getTime() ? "naoExecutada" : "pendente";
}

const ordemSelect = {
  id: true,
  numero: true,
  frenteId: true,
  frente: { select: { id: true, nome: true, codigo: true } },
  dataEmissao: true,
  kmInicial: true,
  kmFinal: true,
  lado: true,
  detalhes: true,
} as const;

export function registerOrdensManutencaoRoutes(app: FastifyInstance): void {
  /**
   * Painel do ciclo de medição (dia 19 do mês anterior ao dia 20 do mês
   * informado, não o mês corrido) — compara OM programada x OM realizada.
   * `dias`: contagem por dia (realizada/aguardando validação/reprovada/
   * pendente/não executada), pra visão geral rápida. `itens`: uma linha por
   * OM do período com o status derivado, pra o técnico conferir
   * individualmente quais ainda faltam.
   */
  app.get<{ Querystring: { mes?: string } }>("/ordens-manutencao/farol", async (request) => {
    const mesParam =
      request.query.mes && /^\d{4}-\d{2}$/.test(request.query.mes)
        ? request.query.mes
        : new Date().toISOString().slice(0, 7);
    const ano = Number(mesParam.slice(0, 4));
    const mes = Number(mesParam.slice(5, 7));

    const inicio = new Date(Date.UTC(ano, mes - 2, 19));
    const fim = new Date(Date.UTC(ano, mes - 1, 20, 23, 59, 59, 999));

    const ordens = await prisma.ordemManutencao.findMany({
      where: { dataEmissao: { gte: inicio, lte: fim } },
      orderBy: { dataEmissao: "asc" },
      select: {
        id: true,
        numero: true,
        dataEmissao: true,
        lado: true,
        detalhes: true,
        frente: { select: { id: true, nome: true, codigo: true } },
        atividades: { select: { rdoLocal: { select: { rdo: { select: { status: true } } } } } },
      },
    });

    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);

    const porDia = new Map<string, Record<StatusFarol, number>>();
    for (const d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
      porDia.set(d.toISOString().slice(0, 10), { ...STATUS_FAROL_ZERADO });
    }

    // Comparativo "OM programada x OM realizada" — uma linha por OM, com o
    // status derivado dos RDOs vinculados a ela, pra o técnico conseguir ver
    // quais faltam (não só quantas por dia).
    const itens: Array<{
      id: string;
      numero: string;
      frenteId: string;
      frenteNome: string;
      frenteCodigo: string;
      dataEmissao: string;
      lado: string | null;
      detalhes: string | null;
      status: StatusFarol;
    }> = [];

    for (const ordem of ordens) {
      const statusDosRdos = ordem.atividades.map((atividade) => atividade.rdoLocal.rdo.status);
      const status = derivarStatusFarol(statusDosRdos, ordem.dataEmissao, hoje);
      const chave = ordem.dataEmissao.toISOString().slice(0, 10);
      const contagem = porDia.get(chave);
      if (contagem) contagem[status] += 1;

      itens.push({
        id: ordem.id,
        numero: ordem.numero,
        frenteId: ordem.frente.id,
        frenteNome: ordem.frente.nome,
        frenteCodigo: ordem.frente.codigo,
        dataEmissao: chave,
        lado: ordem.lado,
        detalhes: ordem.detalhes,
        status,
      });
    }

    const dias = [...porDia.entries()].map(([data, contagem]) => ({
      data,
      diaSemana: DIAS_SEMANA[new Date(`${data}T00:00:00Z`).getUTCDay()],
      ...contagem,
      total: Object.values(contagem).reduce((soma, valor) => soma + valor, 0),
    }));

    return {
      periodo: { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) },
      dias,
      itens,
    };
  });

  app.get("/ordens-manutencao", async () => {
    return prisma.ordemManutencao.findMany({
      orderBy: { dataEmissao: "desc" },
      select: ordemSelect,
    });
  });

  app.post("/ordens-manutencao", async (request, reply) => {
    const data = parseBody(ordemManutencaoCreateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const ordem = await prisma.ordemManutencao.create({ data, select: ordemSelect });
      return await reply.status(201).send(ordem);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe uma ordem com esse número" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Frente informada não existe" });
        }
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>("/ordens-manutencao/:id", async (request, reply) => {
    const data = parseBody(ordemManutencaoUpdateInputSchema, request.body, reply);
    if (!data) return;

    try {
      return await prisma.ordemManutencao.update({
        where: { id: request.params.id },
        data,
        select: ordemSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return reply.status(404).send({ error: "Ordem de manutenção não encontrada" });
        }
        if (error.code === "P2002") {
          return reply.status(409).send({ error: "Já existe uma ordem com esse número" });
        }
        if (error.code === "P2003") {
          return reply.status(400).send({ error: "Frente informada não existe" });
        }
      }
      throw error;
    }
  });

  /**
   * Importa em lote as OMs descritas num PDF de relatório do SAP/ECC (ex.:
   * export "ECC {frente}" da Vale) — cada OM vira um registro, criado ou
   * atualizado (por número, que é único). A frente é a mesma para todas as
   * OMs de um upload porque o relatório sai assim, um arquivo por frente.
   */
  app.post("/ordens-manutencao/importar-pdf", async (request, reply) => {
    let frenteId: string | undefined;
    let arquivo: Buffer | undefined;

    for await (const part of request.parts({ limits: { fileSize: LIMITE_PDF_IMPORTACAO } })) {
      if (part.type === "file") {
        if (part.mimetype !== "application/pdf") {
          return reply.status(400).send({ error: "O arquivo precisa ser um PDF" });
        }
        arquivo = await part.toBuffer();
        if (part.file.truncated) {
          return reply.status(400).send({ error: "Arquivo excede o tamanho máximo permitido" });
        }
      } else if (part.fieldname === "frenteId" && part.type === "field") {
        frenteId = String(part.value);
      }
    }

    if (!arquivo) {
      return reply.status(400).send({ error: "Nenhum arquivo enviado" });
    }
    if (arquivo.subarray(0, 4).toString("ascii") !== "%PDF") {
      return reply.status(400).send({ error: "O conteúdo do arquivo não corresponde a um PDF" });
    }
    if (!frenteId) {
      return reply.status(400).send({ error: "Informe a frente" });
    }

    const frente = await prisma.frente.findUnique({ where: { id: frenteId } });
    if (!frente) {
      return reply.status(400).send({ error: "Frente informada não existe" });
    }

    let extraidas;
    try {
      extraidas = await extrairOrdensDoPdf(arquivo);
    } catch {
      return reply.status(400).send({ error: "Não foi possível ler o PDF" });
    }
    if (extraidas.length === 0) {
      return reply.status(400).send({ error: "Nenhuma ordem de manutenção foi reconhecida nesse PDF" });
    }

    let criadas = 0;
    let atualizadas = 0;
    const ordens = [];
    for (const om of extraidas) {
      const existente = await prisma.ordemManutencao.findUnique({ where: { numero: om.numero } });
      const dados = {
        frenteId: frente.id,
        dataEmissao: om.dataEmissao,
        kmInicial: om.kmInicial,
        kmFinal: om.kmFinal,
        lado: om.lado,
        detalhes: om.detalhes,
      };
      const salvo = await prisma.ordemManutencao.upsert({
        where: { numero: om.numero },
        create: { numero: om.numero, ...dados },
        update: dados,
        select: ordemSelect,
      });
      if (existente) atualizadas += 1;
      else criadas += 1;
      ordens.push(salvo);
    }

    return reply.status(201).send({ criadas, atualizadas, ordens });
  });
}
