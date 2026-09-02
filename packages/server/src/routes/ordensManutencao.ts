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
  if (
    statusDosRdos.some(
      (s) => s === "RASCUNHO" || s === "EM_CORRECAO" || s === "AGUARDANDO_VALIDACAO_ESCRITORIO" || s === "AGUARDANDO_APROVACAO",
    )
  ) {
    return "aguardandoValidacao";
  }
  if (statusDosRdos.includes("REPROVADO")) return "reprovada";
  return dataEmissao.getTime() <= hoje.getTime() ? "naoExecutada" : "pendente";
}

// Prioridade de "o que precisa de atenção primeiro" — usada tanto pra
// escolher o status predominante de uma célula (equipe × dia) com mais de
// uma OM quanto pra ordenar a legenda. Igual ao critério já usado no Farol
// de RDO.
const PRIORIDADE_STATUS_FAROL: StatusFarol[] = ["naoExecutada", "reprovada", "aguardandoValidacao", "pendente", "realizada"];

function statusPredominante(statuses: StatusFarol[]): StatusFarol {
  for (const candidato of PRIORIDADE_STATUS_FAROL) {
    if (statuses.includes(candidato)) return candidato;
  }
  return "pendente";
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

/**
 * A OM "precisa" do Relatório Fotográfico quando algum RDO já declarou uma
 * atividade dela como CONCLUIDA e ainda não existe um relatório com pelo
 * menos 1 foto — é só um indicador (badge na lista/Farol), não trava nada.
 */
function precisaRelatorioFotografico(
  atividades: { statusOm: string | null }[],
  relatorioFotografico: { fotos: unknown[] } | null,
): boolean {
  const temAtividadeConcluida = atividades.some((a) => a.statusOm === "CONCLUIDA");
  const temRelatorioComFoto = (relatorioFotografico?.fotos.length ?? 0) > 0;
  return temAtividadeConcluida && !temRelatorioComFoto;
}

/**
 * A OM já foi "lançada" quando pelo menos um RDO já declarou alguma
 * atividade dela (em andamento ou concluída) — uma mesma OM pode ter mais
 * de uma atividade lançada ao longo do tempo, até ser dada como concluída.
 * Usado pra tirar da lista do Relatório Fotográfico as OMs que ainda nem
 * começaram, que só confundiam (misturadas com as que já têm o que
 * conferir) — essa lista não é sobre planejamento (isso é o Farol de OM),
 * é sobre o que já foi feito e precisa ser documentado.
 */
function foiLancada(atividades: { statusOm: string | null }[]): boolean {
  return atividades.some((a) => a.statusOm === "EM_ANDAMENTO" || a.statusOm === "CONCLUIDA");
}

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

    const [ordens, equipes] = await Promise.all([
      prisma.ordemManutencao.findMany({
        where: { dataEmissao: { gte: inicio, lte: fim } },
        orderBy: { dataEmissao: "asc" },
        select: {
          id: true,
          numero: true,
          dataEmissao: true,
          lado: true,
          detalhes: true,
          frente: { select: { id: true, nome: true, codigo: true } },
          atividades: {
            select: {
              statusOm: true,
              rdoLocal: { select: { rdo: { select: { equipeId: true, status: true, data: true } } } },
            },
          },
          relatorioFotografico: { select: { fotos: { select: { id: true } } } },
        },
      }),
      prisma.equipe.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, encarregadoId: true, distrito: { select: { nome: true } } },
      }),
    ]);

    const encarregadoIds = [...new Set(equipes.map((e) => e.encarregadoId).filter((id): id is string => id != null))];
    const encarregados =
      encarregadoIds.length > 0
        ? await prisma.colaborador.findMany({ where: { id: { in: encarregadoIds } }, select: { id: true, nome: true } })
        : [];
    const nomePorEncarregadoId = new Map(encarregados.map((c) => [c.id, c.nome]));

    const hoje = new Date();
    hoje.setUTCHours(0, 0, 0, 0);

    const porDia = new Map<string, Record<StatusFarol, number>>();
    const dias: string[] = [];
    for (const d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
      const chave = d.toISOString().slice(0, 10);
      porDia.set(chave, { ...STATUS_FAROL_ZERADO });
      dias.push(chave);
    }

    // Grade equipe × dia — cada célula junta as OMs daquele dia atribuídas
    // àquela equipe (uma equipe pode, e costuma, ter mais de uma OM no
    // mesmo dia). Uma OM só "pertence" a uma equipe depois que algum RDO
    // lançou atividade nela — antes disso (pendente/atrasada, ninguém
    // começou ainda) ela não aparece em nenhuma linha, só nos KPIs/itens
    // gerais, porque o sistema não tem como saber quem vai fazer.
    const porEquipeDia = new Map<string, Map<string, { quantidade: number; statuses: StatusFarol[] }>>();
    for (const equipe of equipes) {
      porEquipeDia.set(equipe.id, new Map(dias.map((dia) => [dia, { quantidade: 0, statuses: [] }])));
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
      dataRealizada: string | null;
      lado: string | null;
      detalhes: string | null;
      status: StatusFarol;
      precisaRelatorioFotografico: boolean;
    }> = [];

    for (const ordem of ordens) {
      const rdosDaOrdem = ordem.atividades.map((atividade) => atividade.rdoLocal.rdo);
      const status = derivarStatusFarol(rdosDaOrdem.map((rdo) => rdo.status), ordem.dataEmissao, hoje);
      const chave = ordem.dataEmissao.toISOString().slice(0, 10);
      const contagem = porDia.get(chave);
      if (contagem) contagem[status] += 1;

      const rdoAprovado = rdosDaOrdem.find((rdo) => rdo.status === "APROVADO");

      // A equipe "dona" da OM é a de quem já lançou atividade nela — usa o
      // RDO mais recente quando há mais de um (retrabalho/correção).
      const rdoMaisRecente = rdosDaOrdem.slice().sort((a, b) => b.data.getTime() - a.data.getTime())[0];
      if (rdoMaisRecente) {
        const celula = porEquipeDia.get(rdoMaisRecente.equipeId)?.get(chave);
        if (celula) {
          celula.quantidade += 1;
          celula.statuses.push(status);
        }
      }

      itens.push({
        id: ordem.id,
        numero: ordem.numero,
        frenteId: ordem.frente.id,
        frenteNome: ordem.frente.nome,
        frenteCodigo: ordem.frente.codigo,
        dataEmissao: chave,
        dataRealizada: rdoAprovado ? rdoAprovado.data.toISOString().slice(0, 10) : null,
        lado: ordem.lado,
        detalhes: ordem.detalhes,
        status,
        precisaRelatorioFotografico: precisaRelatorioFotografico(ordem.atividades, ordem.relatorioFotografico),
      });
    }

    const diasResumo = [...porDia.entries()].map(([data, contagem]) => ({
      data,
      diaSemana: DIAS_SEMANA[new Date(`${data}T00:00:00Z`).getUTCDay()],
      ...contagem,
      total: Object.values(contagem).reduce((soma, valor) => soma + valor, 0),
    }));

    const linhas = equipes.map((equipe) => ({
      equipeId: equipe.id,
      equipe: equipe.nome,
      distrito: equipe.distrito.nome,
      encarregado: equipe.encarregadoId ? (nomePorEncarregadoId.get(equipe.encarregadoId) ?? null) : null,
      porDia: Object.fromEntries(
        [...(porEquipeDia.get(equipe.id) ?? new Map())].map(([dia, celula]) => [
          dia,
          celula.quantidade === 0 ? null : { quantidade: celula.quantidade, status: statusPredominante(celula.statuses) },
        ]),
      ),
    }));

    return {
      periodo: { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) },
      dias,
      diasResumo,
      linhas,
      itens,
    };
  });

  app.get("/ordens-manutencao", async () => {
    const ordens = await prisma.ordemManutencao.findMany({
      orderBy: { dataEmissao: "desc" },
      select: {
        ...ordemSelect,
        atividades: { select: { statusOm: true } },
        relatorioFotografico: { select: { fotos: { select: { id: true } } } },
      },
    });
    return ordens.map(({ atividades, relatorioFotografico, ...ordem }) => ({
      ...ordem,
      precisaRelatorioFotografico: precisaRelatorioFotografico(atividades, relatorioFotografico),
      foiLancada: foiLancada(atividades),
    }));
  });

  app.post("/ordens-manutencao", async (request, reply) => {
    const data = parseBody(ordemManutencaoCreateInputSchema, request.body, reply);
    if (!data) return;

    try {
      const ordem = await prisma.ordemManutencao.create({ data, select: ordemSelect });
      return await reply.status(201).send({ ...ordem, precisaRelatorioFotografico: false });
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
      const { atividades, relatorioFotografico, ...ordem } = await prisma.ordemManutencao.update({
        where: { id: request.params.id },
        data,
        select: {
          ...ordemSelect,
          atividades: { select: { statusOm: true } },
          relatorioFotografico: { select: { fotos: { select: { id: true } } } },
        },
      });
      return { ...ordem, precisaRelatorioFotografico: precisaRelatorioFotografico(atividades, relatorioFotografico) };
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
