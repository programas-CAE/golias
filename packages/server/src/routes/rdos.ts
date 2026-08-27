import {
  calcularTotalAtividade,
  rdoCampoUpdateInputSchema,
  rdoCreateInputSchema,
  rdoDraftCreateInputSchema,
} from "@golias/shared";
import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { calcularHashConteudo, gerarPdfRdo, type RdoConteudo } from "../lib/rdoPdf.js";
import { generateToken } from "../lib/tokens.js";
import { parseBody } from "../lib/validate.js";

const LINK_CAMPO_DIAS_VALIDADE = 7;

function minutosDoHorario(horario: string): number {
  const [horaStr, minutoStr] = horario.split(":");
  return Number(horaStr) * 60 + Number(minutoStr);
}

/**
 * Horas trabalhadas de uma atividade — quando início e fim são informados,
 * é sempre derivado deles (fim − início), nunca digitado à parte; cai no
 * valor manual só quando o horário não foi preenchido (RDO antigo, ou
 * formulário sem os campos novos). Horário vencendo meia-noite (fim < início)
 * não é esperado num RDO de um turno só — trata como 0 em vez de negativo.
 */
function resolverHorasTrabalhadas(
  horarioInicial: string | null | undefined,
  horarioFinal: string | null | undefined,
  horasTrabalhadasManual: number | null | undefined,
): number | null {
  if (horarioInicial && horarioFinal) {
    const minutos = minutosDoHorario(horarioFinal) - minutosDoHorario(horarioInicial);
    return minutos > 0 ? Math.round((minutos / 60) * 1000) / 1000 : 0;
  }
  return horasTrabalhadasManual ?? null;
}

interface AtividadeMaoDeObraInput {
  funcaoId: string;
  quantidade: number;
}

/** Total de pessoas na atividade — soma da quebra por função, quando informada; senão cai no número digitado direto. */
function resolverMaoObraDireta(
  maoDeObra: AtividadeMaoDeObraInput[] | undefined,
  maoObraDiretaManual: number | null | undefined,
): number | null {
  if (maoDeObra && maoDeObra.length > 0) {
    return maoDeObra.reduce((soma, item) => soma + item.quantidade, 0);
  }
  return maoObraDiretaManual ?? null;
}

const rdoListSelect = {
  id: true,
  data: true,
  status: true,
  frente: { select: { id: true, nome: true } },
  equipe: { select: { id: true, nome: true } },
  linkCampoToken: true,
  linkCampoExpiraEm: true,
} as const;

export const rdoCampoSelect = {
  id: true,
  frenteId: true,
  frente: { select: { id: true, nome: true, codigo: true, contrato: { select: { numero: true } } } },
  equipeId: true,
  equipe: {
    select: {
      id: true,
      nome: true,
      membros: {
        select: {
          id: true,
          colaboradorId: true,
          colaborador: { select: { id: true, nome: true } },
          funcaoId: true,
          funcao: { select: { id: true, nome: true } },
          quantidade: true,
        },
      },
    },
  },
  data: true,
  status: true,
  clima: true,
  horaExtraInicio: true,
  horaExtraFim: true,
  encarregadoId: true,
  totalDesvios: true,
  observacoesContratada: true,
  observacoesCliente: true,
  linkCampoToken: true,
  linkCampoExpiraEm: true,
  blocosHorario: {
    orderBy: { ordem: "asc" },
    select: { id: true, horarioInicial: true, horarioFinal: true, descricao: true, ordem: true },
  },
  locais: {
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      descricao: true,
      lado: true,
      ordem: true,
      atividades: {
        select: {
          id: true,
          atividadeCatalogoId: true,
          atividadeCatalogo: { select: { id: true, codigo: true, descricao: true, unidade: true, usaDimensoes: true } },
          ordemManutencaoId: true,
          statusOm: true,
          kmInicial: true,
          kmFinal: true,
          altura: true,
          largura: true,
          larguraFinal: true,
          comprimento: true,
          quantidadeDireta: true,
          horarioInicial: true,
          horarioFinal: true,
          horasTrabalhadas: true,
          maoObraDireta: true,
          maoDeObra: { select: { id: true, funcaoId: true, funcao: { select: { id: true, nome: true } }, quantidade: true } },
          totalCalculado: true,
          unidade: true,
        },
      },
    },
  },
  maoDeObra: {
    select: {
      id: true,
      funcaoId: true,
      funcao: { select: { id: true, nome: true } },
      colaboradorId: true,
      colaborador: { select: { id: true, nome: true } },
      quantidade: true,
      horasImprodutivas: true,
      causaImprodutividade: true,
    },
  },
  equipamentos: {
    select: {
      id: true,
      equipamentoCatalogoId: true,
      equipamentoCatalogo: { select: { id: true, nome: true } },
      quantidade: true,
    },
  },
  materiais: {
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      materialCatalogoId: true,
      materialCatalogo: { select: { id: true, codigo: true, descricao: true, unidade: true, precoUnitario: true } },
      quantidade: true,
      ordem: true,
    },
  },
  anexos: {
    select: {
      id: true,
      tipo: true,
      nomeOriginal: true,
      mimeType: true,
      tamanhoBytes: true,
      descricao: true,
      criadoEm: true,
    },
  },
} as const;

const ANEXO_TIPOS = ["FOTO", "NOTA_FISCAL", "DOCUMENTO"] as const;
const ANEXO_MIME_EXTENSAO: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

/**
 * Confere os primeiros bytes do arquivo contra a assinatura esperada do tipo
 * declarado — o Content-Type do multipart é só uma alegação do cliente, não
 * prova do conteúdo real (endpoint público, sem login).
 */
export function assinaturaValida(mimetype: string, buffer: Buffer): boolean {
  switch (mimetype) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return (
        buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "application/pdf":
      return buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF";
    default:
      return false;
  }
}

async function buscarRdoPorToken(token: string) {
  return prisma.rdo.findUnique({ where: { linkCampoToken: token }, select: rdoCampoSelect });
}

function tokenExpirado(expiraEm: Date | null): boolean {
  return expiraEm != null && expiraEm.getTime() < Date.now();
}

type RdoParaPdf = NonNullable<Awaited<ReturnType<typeof buscarRdoPorToken>>>;

/**
 * Monta o conteúdo do RDO com nomes já resolvidos (não IDs), usado tanto
 * para gerar o PDF quanto para calcular o hash de autenticidade.
 * `Rdo.encarregadoId` não tem relação declarada no Prisma — resolvido aqui
 * com uma busca à parte, como já feito em distritos.ts
 * (`/distritos/:id/encarregados`).
 */
async function montarConteudoRdo(rdo: RdoParaPdf): Promise<RdoConteudo> {
  const encarregado = rdo.encarregadoId
    ? await prisma.colaborador.findUnique({ where: { id: rdo.encarregadoId }, select: { nome: true } })
    : null;

  return {
    numeroSap: rdo.frente.contrato.numero,
    encarregadoNome: encarregado?.nome ?? null,
    equipeNome: rdo.equipe.nome,
    frenteNome: rdo.frente.nome,
    data: rdo.data,
    clima: rdo.clima,
    horaExtraInicio: rdo.horaExtraInicio,
    horaExtraFim: rdo.horaExtraFim,
    blocosHorario: rdo.blocosHorario,
    locais: rdo.locais.map((local) => ({
      descricao: local.descricao,
      lado: local.lado,
      atividades: local.atividades.map((atividade) => ({
        item: atividade.atividadeCatalogo.codigo,
        descricao: atividade.atividadeCatalogo.descricao,
        unidade: atividade.unidade,
        quantidade: Number(atividade.totalCalculado),
        kmInicial: atividade.kmInicial != null ? Number(atividade.kmInicial) : null,
        kmFinal: atividade.kmFinal != null ? Number(atividade.kmFinal) : null,
        usaDimensoes: atividade.atividadeCatalogo.usaDimensoes,
        altura: atividade.altura != null ? Number(atividade.altura) : null,
        largura: atividade.largura != null ? Number(atividade.largura) : null,
        larguraFinal: atividade.larguraFinal != null ? Number(atividade.larguraFinal) : null,
        comprimento: atividade.comprimento != null ? Number(atividade.comprimento) : null,
        horarioInicial: atividade.horarioInicial,
        horarioFinal: atividade.horarioFinal,
        statusOm: atividade.statusOm,
        maoDeObra: atividade.maoDeObra
          .filter((item) => item.quantidade > 0)
          .map((item) => ({ funcao: item.funcao.nome, quantidade: item.quantidade })),
      })),
    })),
    maoDeObra: rdo.maoDeObra
      .filter((item) => item.quantidade > 0)
      .map((item) => ({ funcao: item.funcao.nome, quantidade: item.quantidade })),
    equipamentos: rdo.equipamentos
      .filter((item) => item.quantidade > 0)
      .map((item) => ({ nome: item.equipamentoCatalogo.nome, quantidade: item.quantidade })),
    observacoesContratada: rdo.observacoesContratada,
    observacoesCliente: rdo.observacoesCliente,
  };
}

function montarUrlVerificacao(rdoId: string, hash: string): string {
  const publicWebUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:5173";
  return `${publicWebUrl.replace(/\/$/, "")}/verificar/${rdoId}?h=${hash}`;
}

/**
 * (Re)gera o PDF do RDO — com as assinaturas já dadas embutidas, se houver
 * — grava em disco e atualiza `pdfPath`/`pdfHash`. Reaproveitado pela rota
 * manual de gerar PDF e pelos fluxos de envio/assinatura/reprovação, que
 * precisam de um PDF atualizado a cada mudança de status.
 */
export async function gerarEArmazenarPdf(rdoId: string): Promise<{ id: string; pdfPath: string | null; pdfHash: string | null }> {
  const rdo = await prisma.rdo.findUnique({ where: { id: rdoId }, select: rdoCampoSelect });
  if (!rdo) throw new Error(`RDO ${rdoId} não encontrado ao gerar PDF`);

  const [rdoComAssinaturas, aprovacaoFiscal] = await Promise.all([
    prisma.rdo.findUnique({
      where: { id: rdoId },
      select: { assinaturaEncarregadoPath: true, encarregadoId: true, enviadoParaFiscalEm: true },
    }),
    prisma.aprovacaoFiscal.findFirst({
      where: { rdoId, status: { in: ["APROVADO", "REPROVADO"] } },
      orderBy: { criadoEm: "desc" },
      select: { assinaturaImagemPath: true, assinanteNome: true, assinadoEm: true, status: true },
    }),
  ]);

  const encarregado = rdoComAssinaturas?.encarregadoId
    ? await prisma.colaborador.findUnique({ where: { id: rdoComAssinaturas.encarregadoId }, select: { nome: true } })
    : null;

  const conteudo = await montarConteudoRdo(rdo);
  const hash = calcularHashConteudo(conteudo);
  const urlVerificacao = montarUrlVerificacao(rdo.id, hash);

  const assinaturaEncarregado =
    rdoComAssinaturas?.assinaturaEncarregadoPath && rdoComAssinaturas.enviadoParaFiscalEm
      ? {
          imagem: await readFile(rdoComAssinaturas.assinaturaEncarregadoPath),
          nome: encarregado?.nome ?? "Encarregado",
          data: rdoComAssinaturas.enviadoParaFiscalEm,
        }
      : null;
  const assinaturaFiscal =
    aprovacaoFiscal?.status === "APROVADO" && aprovacaoFiscal.assinaturaImagemPath && aprovacaoFiscal.assinadoEm
      ? {
          imagem: await readFile(aprovacaoFiscal.assinaturaImagemPath),
          nome: aprovacaoFiscal.assinanteNome ?? "Fiscal",
          data: aprovacaoFiscal.assinadoEm,
        }
      : null;

  const buffer = await gerarPdfRdo({ ...conteudo, urlVerificacao, assinaturaEncarregado, assinaturaFiscal });

  const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
  const rdoDir = path.join(uploadsRoot, "rdos", rdo.id);
  await mkdir(rdoDir, { recursive: true });
  const caminhoCompleto = path.join(rdoDir, "rdo.pdf");
  await writeFile(caminhoCompleto, buffer);

  return prisma.rdo.update({
    where: { id: rdo.id },
    data: { pdfPath: caminhoCompleto, pdfHash: hash },
    select: { id: true, pdfPath: true, pdfHash: true },
  });
}

export function registerRdosRoutes(app: FastifyInstance): void {
  app.get("/rdos", async () => {
    return prisma.rdo.findMany({ orderBy: { criadoEm: "desc" }, select: rdoListSelect });
  });

  app.post("/rdos", async (request, reply) => {
    const data = parseBody(rdoDraftCreateInputSchema, request.body, reply);
    if (!data) return;

    const linkCampoExpiraEm = new Date();
    linkCampoExpiraEm.setDate(linkCampoExpiraEm.getDate() + LINK_CAMPO_DIAS_VALIDADE);

    try {
      const rdo = await prisma.rdo.create({
        data: { ...data, linkCampoToken: generateToken(), linkCampoExpiraEm },
        select: rdoListSelect,
      });
      return await reply.status(201).send(rdo);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.status(400).send({ error: "Frente ou equipe informada não existe" });
      }
      throw error;
    }
  });

  /**
   * Cadastro completo de um RDO em uma única chamada, feito direto pelo
   * escritório (ex.: transcrevendo um RDO em papel) — ao contrário de
   * `POST /rdos`, que só cria o rascunho para o encarregado preencher pelo
   * link de campo. Ainda gera `linkCampoToken` para que o encarregado possa
   * acessar o RDO depois (ex.: anexar fotos).
   */
  app.post("/rdos/completo", async (request, reply) => {
    const data = parseBody(rdoCreateInputSchema, request.body, reply);
    if (!data) return;

    const linkCampoExpiraEm = new Date();
    linkCampoExpiraEm.setDate(linkCampoExpiraEm.getDate() + LINK_CAMPO_DIAS_VALIDADE);

    try {
      const rdoId = await prisma.$transaction(async (tx) => {
        const rdo = await tx.rdo.create({
          data: {
            frenteId: data.frenteId,
            equipeId: data.equipeId,
            data: data.data,
            horaExtraInicio: data.horaExtraInicio,
            horaExtraFim: data.horaExtraFim,
            clima: data.clima,
            encarregadoId: data.encarregadoId,
            totalDesvios: data.totalDesvios,
            observacoesContratada: data.observacoesContratada,
            linkCampoToken: generateToken(),
            linkCampoExpiraEm,
            blocosHorario: { create: data.blocosHorario },
            maoDeObra: { create: data.maoDeObra },
            equipamentos: { create: data.equipamentos },
            materiais: { create: data.materiais },
          },
          select: { id: true },
        });

        for (const local of data.locais) {
          await tx.rdoLocal.create({
            data: {
              rdoId: rdo.id,
              descricao: local.descricao,
              lado: local.lado,
              ordem: local.ordem,
              atividades: {
                create: local.atividades.map((atividade) => ({
                  atividadeCatalogoId: atividade.atividadeCatalogoId,
                  ordemManutencaoId: atividade.ordemManutencaoId,
                  statusOm: atividade.statusOm,
                  kmInicial: atividade.kmInicial,
                  kmFinal: atividade.kmFinal,
                  altura: atividade.altura,
                  largura: atividade.largura,
                  larguraFinal: atividade.larguraFinal,
                  comprimento: atividade.comprimento,
                  horarioInicial: atividade.horarioInicial,
                  horarioFinal: atividade.horarioFinal,
                  horasTrabalhadas: resolverHorasTrabalhadas(
                    atividade.horarioInicial,
                    atividade.horarioFinal,
                    atividade.horasTrabalhadas,
                  ),
                  maoObraDireta: resolverMaoObraDireta(atividade.maoDeObra, atividade.maoObraDireta),
                  maoDeObra: { create: atividade.maoDeObra },
                  quantidadeDireta: atividade.quantidadeDireta,
                  unidade: atividade.unidade,
                  totalCalculado: calcularTotalAtividade(atividade.unidade, atividade),
                })),
              },
            },
          });
        }

        return rdo.id;
      });

      const criado = await prisma.rdo.findUnique({ where: { id: rdoId }, select: rdoCampoSelect });
      return await reply.status(201).send(criado);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.status(400).send({ error: "Frente, equipe, encarregado, ordem de manutenção, função, colaborador, equipamento ou material inválido" });
      }
      throw error;
    }
  });

  app.get<{ Params: { token: string } }>("/rdos/campo/:token", async (request, reply) => {
    const rdo = await buscarRdoPorToken(request.params.token);
    if (!rdo) {
      return reply.status(404).send({ error: "Link inválido" });
    }
    if (tokenExpirado(rdo.linkCampoExpiraEm)) {
      return reply.status(410).send({ error: "Link expirado" });
    }

    const [ordensManutencao, atividadesCatalogo, ultimaReprovacao] = await Promise.all([
      prisma.ordemManutencao.findMany({
        where: { frenteId: rdo.frenteId },
        select: { id: true, numero: true, detalhes: true, kmInicial: true, kmFinal: true },
      }),
      prisma.atividadeCatalogo.findMany({
        where: { ativo: true },
        orderBy: { ordem: "asc" },
        select: { id: true, codigo: true, descricao: true, unidade: true, usaDimensoes: true },
      }),
      rdo.status === "REPROVADO"
        ? prisma.aprovacaoFiscal.findFirst({
            where: { rdoId: rdo.id, status: "REPROVADO" },
            orderBy: { criadoEm: "desc" },
            select: { comentarioReprovacao: true, assinanteNome: true, assinadoEm: true },
          })
        : null,
    ]);

    return { rdo, ordensManutencao, atividadesCatalogo, ultimaReprovacao };
  });

  app.patch<{ Params: { token: string } }>(
    "/rdos/campo/:token",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const data = parseBody(rdoCampoUpdateInputSchema, request.body, reply);
      if (!data) return;

      const existente = await prisma.rdo.findUnique({
        where: { linkCampoToken: request.params.token },
        select: { id: true, linkCampoExpiraEm: true, status: true, encarregadoId: true },
      });
      if (!existente) {
        return reply.status(404).send({ error: "Link inválido" });
      }
      if (tokenExpirado(existente.linkCampoExpiraEm)) {
        return reply.status(410).send({ error: "Link expirado" });
      }

      const rdoId = existente.id;
      // Reprovado pelo fiscal + editado de novo pelo encarregado = está em
      // correção — reabre o fluxo para poder ser reenviado (ver máquina de
      // estados do RdoStatus). Outros status não mudam ao salvar rascunho.
      const reabrindoAposReprovacao = existente.status === "REPROVADO";

      try {
        await prisma.$transaction(async (tx) => {
          await tx.rdoBlocoHorario.deleteMany({ where: { rdoId } });
          await tx.rdoAtividadeMaoDeObra.deleteMany({ where: { rdoAtividade: { rdoLocal: { rdoId } } } });
          await tx.rdoAtividade.deleteMany({ where: { rdoLocal: { rdoId } } });
          await tx.rdoLocal.deleteMany({ where: { rdoId } });
          await tx.rdoMaoDeObra.deleteMany({ where: { rdoId } });
          await tx.rdoEquipamento.deleteMany({ where: { rdoId } });
          await tx.rdoMaterial.deleteMany({ where: { rdoId } });

          await tx.rdo.update({
            where: { id: rdoId },
            data: {
              horaExtraInicio: data.horaExtraInicio,
              horaExtraFim: data.horaExtraFim,
              clima: data.clima,
              encarregadoId: data.encarregadoId,
              totalDesvios: data.totalDesvios,
              observacoesContratada: data.observacoesContratada,
              blocosHorario: { create: data.blocosHorario },
              maoDeObra: { create: data.maoDeObra },
              equipamentos: { create: data.equipamentos },
              materiais: { create: data.materiais },
              ...(reabrindoAposReprovacao ? { status: "EM_CORRECAO" as const } : {}),
            },
          });

          for (const local of data.locais) {
            await tx.rdoLocal.create({
              data: {
                rdoId,
                descricao: local.descricao,
                lado: local.lado,
                ordem: local.ordem,
                atividades: {
                  create: local.atividades.map((atividade) => ({
                    atividadeCatalogoId: atividade.atividadeCatalogoId,
                    ordemManutencaoId: atividade.ordemManutencaoId,
                    statusOm: atividade.statusOm,
                    kmInicial: atividade.kmInicial,
                    kmFinal: atividade.kmFinal,
                    altura: atividade.altura,
                    largura: atividade.largura,
                    larguraFinal: atividade.larguraFinal,
                    comprimento: atividade.comprimento,
                    horarioInicial: atividade.horarioInicial,
                    horarioFinal: atividade.horarioFinal,
                    horasTrabalhadas: resolverHorasTrabalhadas(
                      atividade.horarioInicial,
                      atividade.horarioFinal,
                      atividade.horasTrabalhadas,
                    ),
                    maoObraDireta: resolverMaoObraDireta(atividade.maoDeObra, atividade.maoObraDireta),
                    maoDeObra: { create: atividade.maoDeObra },
                    quantidadeDireta: atividade.quantidadeDireta,
                    unidade: atividade.unidade,
                    totalCalculado: calcularTotalAtividade(atividade.unidade, atividade),
                  })),
                },
              },
            });
          }

          if (reabrindoAposReprovacao) {
            const encarregado = data.encarregadoId
              ? await tx.colaborador.findUnique({ where: { id: data.encarregadoId }, select: { nome: true } })
              : null;
            await tx.rdoHistorico.create({
              data: { rdoId, deStatus: "REPROVADO", paraStatus: "EM_CORRECAO", ator: encarregado?.nome ?? "Encarregado" },
            });
          }
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          return reply.status(400).send({ error: "Ordem de manutenção, função, colaborador, equipamento ou material inválido" });
        }
        throw error;
      }

      return await buscarRdoPorToken(request.params.token);
    },
  );

  app.post<{ Params: { token: string }; Querystring: { tipo?: string; descricao?: string } }>(
    "/rdos/campo/:token/anexos",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const rdo = await prisma.rdo.findUnique({
        where: { linkCampoToken: request.params.token },
        select: { id: true, linkCampoExpiraEm: true },
      });
      if (!rdo) {
        return reply.status(404).send({ error: "Link inválido" });
      }
      if (tokenExpirado(rdo.linkCampoExpiraEm)) {
        return reply.status(410).send({ error: "Link expirado" });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "Nenhum arquivo enviado" });
      }

      const extensao = ANEXO_MIME_EXTENSAO[file.mimetype];
      if (!extensao) {
        return reply.status(400).send({ error: "Tipo de arquivo não permitido" });
      }

      const buffer = await file.toBuffer();

      if (file.file.truncated) {
        return reply.status(400).send({ error: "Arquivo excede o tamanho máximo permitido" });
      }
      if (!assinaturaValida(file.mimetype, buffer)) {
        return reply.status(400).send({ error: "O conteúdo do arquivo não corresponde ao tipo declarado" });
      }

      const tipoQuery = request.query.tipo;
      const tipo = (ANEXO_TIPOS as readonly string[]).includes(tipoQuery ?? "")
        ? (tipoQuery as (typeof ANEXO_TIPOS)[number])
        : "FOTO";

      const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
      const rdoDir = path.join(uploadsRoot, rdo.id);
      await mkdir(rdoDir, { recursive: true });

      const nomeArquivo = `${generateToken()}${extensao}`;
      const caminhoCompleto = path.join(rdoDir, nomeArquivo);
      await writeFile(caminhoCompleto, buffer);

      const anexo = await prisma.rdoAnexo.create({
        data: {
          rdoId: rdo.id,
          tipo,
          caminhoArquivo: caminhoCompleto,
          nomeOriginal: file.filename,
          mimeType: file.mimetype,
          tamanhoBytes: buffer.length,
          descricao: request.query.descricao ?? null,
        },
        select: {
          id: true,
          tipo: true,
          nomeOriginal: true,
          mimeType: true,
          tamanhoBytes: true,
          descricao: true,
          criadoEm: true,
        },
      });

      return await reply.status(201).send(anexo);
    },
  );

  /**
   * O encarregado finaliza o preenchimento e envia para aprovação —
   * diferente do PATCH acima, que só salva o rascunho em progresso. Exige
   * assinatura desenhada (canvas) e pelo menos 1 local com atividade,
   * mesma regra de "RDO completo" (`rdoCreateInputSchema`).
   */
  app.post<{ Params: { token: string } }>(
    "/rdos/campo/:token/enviar",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const rdo = await prisma.rdo.findUnique({
        where: { linkCampoToken: request.params.token },
        select: {
          id: true,
          status: true,
          linkCampoExpiraEm: true,
          encarregadoId: true,
          locais: { select: { atividades: { select: { id: true } } } },
        },
      });
      if (!rdo) {
        return reply.status(404).send({ error: "Link inválido" });
      }
      if (tokenExpirado(rdo.linkCampoExpiraEm)) {
        return reply.status(410).send({ error: "Link expirado" });
      }
      if (!["RASCUNHO", "EM_CORRECAO"].includes(rdo.status)) {
        return reply.status(409).send({ error: "Este RDO já foi enviado para aprovação" });
      }
      if (!rdo.locais.some((local) => local.atividades.length > 0)) {
        return reply.status(400).send({ error: "Informe ao menos um local com atividade antes de enviar" });
      }

      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ error: "Assinatura não enviada" });
      }
      if (file.mimetype !== "image/png") {
        return reply.status(400).send({ error: "A assinatura precisa ser PNG" });
      }
      const buffer = await file.toBuffer();
      if (file.file.truncated || !assinaturaValida("image/png", buffer)) {
        return reply.status(400).send({ error: "Assinatura inválida" });
      }

      const encarregado = rdo.encarregadoId
        ? await prisma.colaborador.findUnique({ where: { id: rdo.encarregadoId }, select: { nome: true } })
        : null;

      const uploadsRoot = process.env.UPLOADS_ROOT ?? "./uploads";
      const rdoDir = path.join(uploadsRoot, "rdos", rdo.id);
      await mkdir(rdoDir, { recursive: true });
      const caminhoAssinatura = path.join(rdoDir, "assinatura-encarregado.png");
      await writeFile(caminhoAssinatura, buffer);

      await prisma.$transaction([
        prisma.rdo.update({
          where: { id: rdo.id },
          data: {
            status: "AGUARDANDO_APROVACAO",
            assinaturaEncarregadoPath: caminhoAssinatura,
            enviadoParaFiscalEm: new Date(),
          },
        }),
        prisma.rdoHistorico.create({
          data: {
            rdoId: rdo.id,
            deStatus: rdo.status,
            paraStatus: "AGUARDANDO_APROVACAO",
            ator: encarregado?.nome ?? "Encarregado",
          },
        }),
      ]);

      await gerarEArmazenarPdf(rdo.id);

      return buscarRdoPorToken(request.params.token);
    },
  );

  /**
   * Farol de RDO: uma linha por equipe ativa, uma coluna por dia do ciclo
   * de medição (dia 19 do mês anterior ao dia 20 do mês informado — mesmo
   * ciclo do Farol de OM, não o mês corrido) — pra grade "equipe × dia"
   * mostrar de relance quem já mandou o RDO, quem está aguardando
   * assinatura, quem foi aprovado/reprovado. Sem colunas de
   * supervisor/fiscal (a planilha de referência tem, o GOLIAS não modela
   * isso hoje) — só o que já existe: equipe, distrito, encarregado e o
   * status do RDO por dia.
   */
  app.get<{ Querystring: { periodo?: string } }>("/rdos/farol-status", async (request) => {
    const periodo =
      request.query.periodo && /^\d{4}-\d{2}$/.test(request.query.periodo)
        ? request.query.periodo
        : new Date().toISOString().slice(0, 7);
    const ano = Number(periodo.slice(0, 4));
    const mes = Number(periodo.slice(5, 7));
    const inicio = new Date(Date.UTC(ano, mes - 2, 19));
    const fim = new Date(Date.UTC(ano, mes - 1, 20, 23, 59, 59, 999));

    const [equipes, rdos] = await Promise.all([
      prisma.equipe.findMany({
        where: { ativo: true },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, encarregadoId: true, distrito: { select: { nome: true } } },
      }),
      prisma.rdo.findMany({
        where: { data: { gte: inicio, lte: fim } },
        orderBy: { data: "asc" },
        select: { id: true, equipeId: true, data: true, status: true, atualizadoEm: true },
      }),
    ]);

    const encarregadoIds = [...new Set(equipes.map((e) => e.encarregadoId).filter((id): id is string => id != null))];
    const encarregados =
      encarregadoIds.length > 0
        ? await prisma.colaborador.findMany({ where: { id: { in: encarregadoIds } }, select: { id: true, nome: true } })
        : [];
    const nomePorEncarregadoId = new Map(encarregados.map((c) => [c.id, c.nome]));

    // Se por algum motivo houver mais de um RDO da mesma equipe no mesmo
    // dia, fica o mais recente (atualizadoEm) — não deveria acontecer no
    // fluxo normal, mas evita a grade quebrar se acontecer.
    const statusPorChave = new Map<string, { status: string; atualizadoEm: Date }>();
    for (const rdo of rdos) {
      const chave = `${rdo.equipeId}|${rdo.data.toISOString().slice(0, 10)}`;
      const atual = statusPorChave.get(chave);
      if (!atual || rdo.atualizadoEm > atual.atualizadoEm) {
        statusPorChave.set(chave, { status: rdo.status, atualizadoEm: rdo.atualizadoEm });
      }
    }

    const dias: string[] = [];
    for (const d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
      dias.push(d.toISOString().slice(0, 10));
    }

    const linhas = equipes.map((equipe) => ({
      equipeId: equipe.id,
      equipe: equipe.nome,
      distrito: equipe.distrito.nome,
      encarregado: equipe.encarregadoId ? (nomePorEncarregadoId.get(equipe.encarregadoId) ?? null) : null,
      porDia: Object.fromEntries(
        dias.map((dia) => [dia, statusPorChave.get(`${equipe.id}|${dia}`)?.status ?? null]),
      ),
    }));

    // Lista plana, um RDO por linha — pra agrupar por status embaixo da
    // grade (quais estão em correção, quais faltam assinar etc.), já que a
    // grade sozinha só dá a visão de relance por dia.
    const equipePorId = new Map(equipes.map((equipe) => [equipe.id, equipe]));
    const itens = rdos.map((rdo) => {
      const equipe = equipePorId.get(rdo.equipeId);
      return {
        id: rdo.id,
        data: rdo.data.toISOString().slice(0, 10),
        status: rdo.status,
        equipeId: rdo.equipeId,
        equipe: equipe?.nome ?? "—",
        distrito: equipe?.distrito.nome ?? "—",
        encarregado: equipe?.encarregadoId ? (nomePorEncarregadoId.get(equipe.encarregadoId) ?? null) : null,
      };
    });

    return { periodo, dias, linhas, itens };
  });

  app.get<{ Params: { id: string } }>("/rdos/:id", async (request, reply) => {
    const rdo = await prisma.rdo.findUnique({ where: { id: request.params.id }, select: rdoCampoSelect });
    if (!rdo) return reply.status(404).send({ error: "RDO não encontrado" });

    const ultimaReprovacao =
      rdo.status === "REPROVADO" || rdo.status === "EM_CORRECAO"
        ? await prisma.aprovacaoFiscal.findFirst({
            where: { rdoId: rdo.id, status: "REPROVADO" },
            orderBy: { criadoEm: "desc" },
            select: { comentarioReprovacao: true, assinanteNome: true, assinadoEm: true },
          })
        : null;

    return { ...rdo, ultimaReprovacao };
  });

  app.post<{ Params: { id: string } }>("/rdos/:id/pdf", async (request, reply) => {
    const existe = await prisma.rdo.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!existe) return reply.status(404).send({ error: "RDO não encontrado" });

    return gerarEArmazenarPdf(request.params.id);
  });

  app.get<{ Params: { id: string } }>("/rdos/:id/pdf", async (request, reply) => {
    const rdo = await prisma.rdo.findUnique({
      where: { id: request.params.id },
      select: { pdfPath: true },
    });
    if (!rdo?.pdfPath) return reply.status(404).send({ error: "PDF ainda não foi gerado para este RDO" });

    const buffer = await readFile(rdo.pdfPath);
    return reply.header("Content-Type", "application/pdf").send(buffer);
  });

  /**
   * Pública (sem login) e propositalmente enxuta — o que dá pra ver
   * escaneando o QR do PDF, sem expor dados sensíveis do RDO. Segue a mesma
   * filosofia de acesso sem autenticação de `/rdos/campo/:token`, mas por ID
   * (não por token secreto) porque aqui o objetivo é o oposto: qualquer um
   * com o papel em mãos deve conseguir validar, não é um link privado.
   */
  app.get<{ Params: { id: string }; Querystring: { h?: string } }>(
    "/rdos/:id/verificar",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const rdo = await prisma.rdo.findUnique({
        where: { id: request.params.id },
        select: {
          id: true,
          data: true,
          status: true,
          pdfHash: true,
          frente: { select: { nome: true } },
          equipe: { select: { nome: true } },
        },
      });
      if (!rdo) return reply.status(404).send({ error: "RDO não encontrado" });

      const hashRecebido = request.query.h;
      const autentico = hashRecebido != null && rdo.pdfHash != null && hashRecebido === rdo.pdfHash;

      return {
        rdoId: rdo.id,
        data: rdo.data,
        frente: rdo.frente.nome,
        equipe: rdo.equipe.nome,
        status: rdo.status,
        autentico,
        motivo: rdo.pdfHash == null ? "PDF_NAO_GERADO" : autentico ? "OK" : "HASH_DESATUALIZADO",
      };
    },
  );
}
