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
import { ANEXO_MIME_EXTENSAO, ANEXO_TIPOS, assinaturaValida, salvarArquivoAnexo } from "../lib/anexoArquivo.js";
import { comCodigoRastreio } from "../lib/codigoRastreio.js";
import { enviarEmail } from "../lib/email.js";
import { prisma } from "../lib/prisma.js";
import { calcularHashConteudo, gerarPdfRdo, type RdoConteudo, type RdoPdfGrupoFotos } from "../lib/rdoPdf.js";
import { gerarPdfRdoSuperestrutura } from "../lib/rdoSuperestruturaPdf.js";
import { generateToken } from "../lib/tokens.js";
import { parseBody } from "../lib/validate.js";

export const LINK_CAMPO_DIAS_VALIDADE = 7;

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

/**
 * Monta os dados de criação de uma RdoAtividade (incluindo os pontosExtras
 * aninhados) a partir de um input validado — reaproveitado por
 * `POST /rdos/completo` e por `substituirConteudoRdo`. O totalCalculado da
 * atividade soma o Ponto 1 (os campos diretos: altura/largura/.../
 * quantidadeDireta) com o de cada ponto extra — ver comentário em
 * RdoAtividade.pontosExtras em schema.prisma.
 */
function montarDadosCriacaoAtividade(atividade: import("@golias/shared").RdoAtividadeInput) {
  const totalPonto1 = calcularTotalAtividade(atividade.unidade, atividade);
  const totalPontosExtras = atividade.pontosExtras.reduce(
    (soma, ponto) => soma + calcularTotalAtividade(atividade.unidade, ponto),
    0,
  );

  return {
    atividadeCatalogoId: atividade.atividadeCatalogoId,
    ordemManutencaoId: atividade.ordemManutencaoId,
    statusOm: atividade.statusOm,
    percentualConcluido: atividade.percentualConcluido,
    kmInicial: atividade.kmInicial,
    kmFinal: atividade.kmFinal,
    horimetroInicial: atividade.horimetroInicial,
    horimetroFinal: atividade.horimetroFinal,
    altura: atividade.altura,
    largura: atividade.largura,
    larguraFinal: atividade.larguraFinal,
    comprimento: atividade.comprimento,
    horarioInicial: atividade.horarioInicial,
    horarioFinal: atividade.horarioFinal,
    horasTrabalhadas: resolverHorasTrabalhadas(atividade.horarioInicial, atividade.horarioFinal, atividade.horasTrabalhadas),
    maoObraDireta: resolverMaoObraDireta(atividade.maoDeObra, atividade.maoObraDireta),
    maoDeObra: { create: atividade.maoDeObra },
    quantidadeDireta: atividade.quantidadeDireta,
    unidade: atividade.unidade,
    totalCalculado: totalPonto1 + totalPontosExtras,
    pontosExtras: {
      create: atividade.pontosExtras.map((ponto, indice) => ({
        ordem: ponto.ordem ?? indice,
        altura: ponto.altura,
        largura: ponto.largura,
        larguraFinal: ponto.larguraFinal,
        comprimento: ponto.comprimento,
        quantidadeDireta: ponto.quantidadeDireta,
        totalCalculado: calcularTotalAtividade(atividade.unidade, ponto),
      })),
    },
  };
}

/**
 * Apaga e recria todo o conteúdo "de formulário" de um RDO (locais,
 * atividades, mão de obra, equipamentos, materiais, blocos de horário) a
 * partir de um payload validado por `rdoCampoUpdateInputSchema` —
 * reaproveitado tanto por `PATCH /rdos/campo/:token` (encarregado, via
 * link público) quanto por `PATCH /rdos/:id` (escritório, revisando antes
 * de mandar pro fiscal). Não mexe em status — cada rota decide a transição
 * de status que faz sentido pra quem está chamando.
 */
async function substituirConteudoRdo(
  tx: Prisma.TransactionClient,
  rdoId: string,
  data: import("@golias/shared").RdoCampoUpdateInput,
): Promise<void> {
  await tx.rdoBlocoHorario.deleteMany({ where: { rdoId } });
  await tx.rdoAtividadeMaoDeObra.deleteMany({ where: { rdoAtividade: { rdoLocal: { rdoId } } } });
  await tx.rdoAtividadePonto.deleteMany({ where: { rdoAtividade: { rdoLocal: { rdoId } } } });
  await tx.rdoAtividade.deleteMany({ where: { rdoLocal: { rdoId } } });
  await tx.rdoLocal.deleteMany({ where: { rdoId } });
  await tx.rdoMaoDeObra.deleteMany({ where: { rdoId } });
  await tx.rdoEquipamento.deleteMany({ where: { rdoId } });
  await tx.rdoMaterial.deleteMany({ where: { rdoId } });
  await tx.rdoSuperestruturaTemperatura.deleteMany({ where: { rdoSuperestrutura: { rdoId } } });
  await tx.rdoSuperestruturaServico.deleteMany({ where: { rdoSuperestrutura: { rdoId } } });

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
          create: local.atividades.map((atividade) => montarDadosCriacaoAtividade(atividade)),
        },
      },
    });
  }

  if (data.superestrutura) {
    const dadosSuperestrutura = {
      intervaloProgramadoInicio: data.superestrutura.intervaloProgramadoInicio,
      intervaloProgramadoFim: data.superestrutura.intervaloProgramadoFim,
      intervaloRealizadoInicio: data.superestrutura.intervaloRealizadoInicio,
      intervaloRealizadoFim: data.superestrutura.intervaloRealizadoFim,
      tempoTotalPerdas: data.superestrutura.tempoTotalPerdas,
      leiturasTemperatura: { create: data.superestrutura.leiturasTemperatura },
      servicos: { create: data.superestrutura.servicos },
    };
    await tx.rdoSuperestrutura.upsert({
      where: { rdoId },
      create: { rdoId, ...dadosSuperestrutura },
      update: dadosSuperestrutura,
    });
  }
}

/**
 * Um RDO só está pronto pra enviar se tem algum conteúdo mensurável — ou
 * atividade(s) do catálogo (Preventiva, com dimensões), ou produção de
 * algum equipamento (terraplenagem, que aponta por máquina em vez de
 * atividade — ver comentário em rdoEquipamentoInputSchema). Mesma regra
 * usada em rdoCreateInputSchema (packages/shared), aqui reaplicada porque
 * os RDOs criados como rascunho vazio (`POST /rdos`) passam por esse
 * schema só depois, ao enviar.
 */
function rdoTemConteudo(rdo: {
  tipo?: string;
  locais: Array<{ atividades: Array<{ id: string }> }>;
  equipamentos: Array<{ producaoValor: unknown; horimetroFinal?: unknown }>;
  superestrutura?: { servicos: Array<{ id: string }> } | null;
}): boolean {
  if (rdo.tipo === "SUPERESTRUTURA") {
    return (rdo.superestrutura?.servicos.length ?? 0) > 0;
  }
  const temAtividade = rdo.locais.some((local) => local.atividades.length > 0);
  const temProducaoEquipamento = rdo.equipamentos.some(
    (equipamento) => equipamento.producaoValor != null || equipamento.horimetroFinal != null,
  );
  return temAtividade || temProducaoEquipamento;
}

/**
 * Avisa por e-mail os fiscais cadastrados (Usuario role FISCAL) da frente
 * do RDO que acabou de chegar pra aprovação — sem isso, o fiscal só fica
 * sabendo se abrir o portal por conta própria. Best-effort (enviarEmail já
 * não derruba nada se o SMTP não estiver configurado ou o envio falhar).
 */
async function notificarFiscaisRdoAguardando(rdo: {
  id: string;
  frenteId: string;
  frente: { nome: string };
  equipe: { nome: string };
  data: Date;
}): Promise<void> {
  const fiscais = await prisma.usuario.findMany({
    where: { role: "FISCAL", frenteId: rdo.frenteId, ativo: true, email: { not: null } },
    select: { email: true },
  });
  if (fiscais.length === 0) return;

  const publicWebUrl = process.env.PUBLIC_WEB_URL ?? "http://localhost:5173";
  const dataFormatada = rdo.data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const texto = `Um RDO está aguardando sua aprovação.\n\nFrente: ${rdo.frente.nome}\nEquipe: ${rdo.equipe.nome}\nData: ${dataFormatada}\n\nAcesse ${publicWebUrl}/login pra revisar e assinar.`;

  await Promise.all(
    fiscais.map((fiscal) =>
      enviarEmail({
        para: fiscal.email!,
        assunto: `RDO aguardando aprovação — ${rdo.frente.nome} (${dataFormatada})`,
        texto,
      }),
    ),
  );
}

/**
 * Última leitura de horímetro (final) de cada equipamento já usado por essa
 * equipe, em RDOs de dias anteriores — pra sugerir o horimetroInicial de
 * hoje sem o encarregado precisar ir atrás do valor (ele só confere/ajusta
 * e informa o final de hoje). Exclui o próprio RDO (relevante ao reabrir um
 * RASCUNHO/EM_CORRECAO pra editar de novo — senão os dados de hoje
 * "sugeririam" a si mesmos).
 */
async function montarUltimosHorimetros(equipeId: string, data: Date, rdoIdAtual: string): Promise<Record<string, number>> {
  const registros = await prisma.rdoEquipamento.findMany({
    where: {
      horimetroFinal: { not: null },
      rdo: { equipeId, data: { lt: data }, id: { not: rdoIdAtual } },
    },
    orderBy: { rdo: { data: "desc" } },
    select: { equipamentoCatalogoId: true, horimetroFinal: true },
  });

  const resultado: Record<string, number> = {};
  for (const registro of registros) {
    if (!(registro.equipamentoCatalogoId in resultado) && registro.horimetroFinal != null) {
      resultado[registro.equipamentoCatalogoId] = Number(registro.horimetroFinal);
    }
  }
  return resultado;
}

interface UltimaDecisaoFiscal {
  status: "APROVADO" | "REPROVADO";
  comentario: string | null;
  assinanteNome: string | null;
  assinadoEm: Date | null;
}

/**
 * Última decisão do fiscal sobre o RDO (aprovação ou reprovação), com o
 * comentário dela — pra mostrar pro escritório tanto quando ele reabre em
 * correção (o que o fiscal reprovou) quanto quando já foi aprovado (a
 * observação que o fiscal deixou, se deixou). Só busca quando o status do
 * RDO indica que já passou pelo fiscal; nos demais (rascunho, aguardando
 * validação/aprovação) não há decisão ainda.
 */
async function buscarUltimaDecisaoFiscal(rdoId: string, status: string): Promise<UltimaDecisaoFiscal | null> {
  const statusBusca = status === "APROVADO" ? "APROVADO" : status === "REPROVADO" || status === "EM_CORRECAO" ? "REPROVADO" : null;
  if (!statusBusca) return null;

  const decisao = await prisma.aprovacaoFiscal.findFirst({
    where: { rdoId, status: statusBusca },
    orderBy: { criadoEm: "desc" },
    select: { status: true, comentarioReprovacao: true, observacao: true, assinanteNome: true, assinadoEm: true },
  });
  if (!decisao) return null;

  return {
    status: statusBusca,
    comentario: statusBusca === "APROVADO" ? decisao.observacao : decisao.comentarioReprovacao,
    assinanteNome: decisao.assinanteNome,
    assinadoEm: decisao.assinadoEm,
  };
}

const rdoListSelect = {
  id: true,
  codigoRastreio: true,
  data: true,
  tipo: true,
  status: true,
  frente: { select: { id: true, nome: true } },
  equipe: { select: { id: true, nome: true } },
  linkCampoToken: true,
  linkCampoExpiraEm: true,
  pdfPath: true,
} as const;

/** Não expõe o caminho em disco (`pdfPath` é interno) — só se o PDF já existe. */
function comPdfDisponivel<T extends { pdfPath: string | null }>({ pdfPath, ...resto }: T): Omit<T, "pdfPath"> & { pdfDisponivel: boolean } {
  return { ...resto, pdfDisponivel: pdfPath != null };
}

export const rdoCampoSelect = {
  id: true,
  codigoRastreio: true,
  frenteId: true,
  frente: { select: { id: true, nome: true, codigo: true, contrato: { select: { numero: true } } } },
  obraId: true,
  obra: { select: { id: true, nome: true } },
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
  tipo: true,
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
          ordemManutencao: { select: { id: true, numero: true } },
          statusOm: true,
          percentualConcluido: true,
          kmInicial: true,
          kmFinal: true,
          horimetroInicial: true,
          horimetroFinal: true,
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
          pontosExtras: {
            orderBy: { ordem: "asc" },
            select: {
              id: true,
              ordem: true,
              altura: true,
              largura: true,
              larguraFinal: true,
              comprimento: true,
              quantidadeDireta: true,
              totalCalculado: true,
            },
          },
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
      producaoDescricao: true,
      producaoValor: true,
      producaoUnidade: true,
      horimetroInicial: true,
      horimetroFinal: true,
      kmInicial: true,
      kmFinal: true,
      rota: true,
      combustivelLitros: true,
      combustivelPosto: true,
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
      ordemManutencaoId: true,
      ordemManutencao: { select: { id: true, numero: true } },
      criadoEm: true,
    },
  },
  // Só existe quando tipo === "SUPERESTRUTURA" (relação 1:1 opcional) — os
  // outros dois tipos vêm sempre null aqui, custo desprezível.
  superestrutura: {
    select: {
      intervaloProgramadoInicio: true,
      intervaloProgramadoFim: true,
      intervaloRealizadoInicio: true,
      intervaloRealizadoFim: true,
      tempoTotalPerdas: true,
      leiturasTemperatura: { orderBy: { ordem: "asc" }, select: { hora: true, temperaturaC: true, ordem: true } },
      servicos: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          codigo: true,
          descricao: true,
          unidade: true,
          quantidade: true,
          linha: true,
          kmInicial: true,
          kmFinal: true,
          ordem: true,
        },
      },
    },
  },
} as const;

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
/**
 * Fotos (tipo FOTO) do RDO, agrupadas pela OM que o encarregado marcou ao
 * enviar cada uma — pra aparecer separado por OM no PDF, em vez de uma
 * lista solta. Fotos sem OM (ou anexos que não são foto, como nota fiscal)
 * caem no grupo "Fotos gerais" ou ficam de fora, respectivamente.
 */
async function montarGruposFotos(rdoId: string): Promise<RdoPdfGrupoFotos[]> {
  const fotos = await prisma.rdoAnexo.findMany({
    where: { rdoId, tipo: "FOTO" },
    orderBy: { criadoEm: "asc" },
    select: {
      caminhoArquivo: true,
      descricao: true,
      ordemManutencaoId: true,
      ordemManutencao: { select: { numero: true } },
    },
  });

  const grupos = new Map<string, { omNumero: string | null; fotos: { imagem: Buffer; legenda: string | null }[] }>();
  for (const foto of fotos) {
    const chave = foto.ordemManutencaoId ?? "__geral__";
    if (!grupos.has(chave)) {
      grupos.set(chave, { omNumero: foto.ordemManutencao?.numero ?? null, fotos: [] });
    }
    let imagem: Buffer;
    try {
      imagem = await readFile(foto.caminhoArquivo);
    } catch {
      continue;
    }
    grupos.get(chave)!.fotos.push({ imagem, legenda: foto.descricao });
  }

  // OMs primeiro (na ordem em que apareceram), "Fotos gerais" por último.
  const comOm = [...grupos.values()].filter((g) => g.omNumero != null);
  const semOm = grupos.get("__geral__");
  return semOm && semOm.fotos.length > 0 ? [...comOm, semOm] : comOm;
}

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
        horimetroInicial: atividade.horimetroInicial != null ? Number(atividade.horimetroInicial) : null,
        horimetroFinal: atividade.horimetroFinal != null ? Number(atividade.horimetroFinal) : null,
        usaDimensoes: atividade.atividadeCatalogo.usaDimensoes,
        altura: atividade.altura != null ? Number(atividade.altura) : null,
        largura: atividade.largura != null ? Number(atividade.largura) : null,
        larguraFinal: atividade.larguraFinal != null ? Number(atividade.larguraFinal) : null,
        comprimento: atividade.comprimento != null ? Number(atividade.comprimento) : null,
        horarioInicial: atividade.horarioInicial,
        horarioFinal: atividade.horarioFinal,
        omNumero: atividade.ordemManutencao?.numero ?? null,
        statusOm: atividade.statusOm,
        percentualConcluido: atividade.percentualConcluido,
        maoDeObra: atividade.maoDeObra
          .filter((item) => item.quantidade > 0)
          .map((item) => ({ funcao: item.funcao.nome, quantidade: item.quantidade })),
        pontosExtras: atividade.pontosExtras.map((ponto) => ({
          altura: ponto.altura != null ? Number(ponto.altura) : null,
          largura: ponto.largura != null ? Number(ponto.largura) : null,
          larguraFinal: ponto.larguraFinal != null ? Number(ponto.larguraFinal) : null,
          comprimento: ponto.comprimento != null ? Number(ponto.comprimento) : null,
          quantidade: Number(ponto.totalCalculado),
        })),
      })),
    })),
    maoDeObra: rdo.maoDeObra
      .filter((item) => item.quantidade > 0)
      .map((item) => ({ funcao: item.funcao.nome, quantidade: item.quantidade })),
    equipamentos: rdo.equipamentos
      .filter((item) => item.quantidade > 0)
      .map((item) => ({
        nome: item.equipamentoCatalogo.nome,
        quantidade: item.quantidade,
        producaoDescricao: item.producaoDescricao,
        producaoValor: item.producaoValor != null ? Number(item.producaoValor) : null,
        producaoUnidade: item.producaoUnidade,
        horimetroInicial: item.horimetroInicial != null ? Number(item.horimetroInicial) : null,
        horimetroFinal: item.horimetroFinal != null ? Number(item.horimetroFinal) : null,
        kmInicial: item.kmInicial != null ? Number(item.kmInicial) : null,
        kmFinal: item.kmFinal != null ? Number(item.kmFinal) : null,
        rota: item.rota,
        combustivelLitros: item.combustivelLitros != null ? Number(item.combustivelLitros) : null,
        combustivelPosto: item.combustivelPosto,
      })),
    materiais: rdo.materiais
      .filter((item) => Number(item.quantidade) > 0)
      .map((item) => ({
        nome: item.materialCatalogo.descricao,
        unidade: item.materialCatalogo.unidade,
        quantidade: Number(item.quantidade),
      })),
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
/** Só usado quando `rdo.tipo === "SUPERESTRUTURA"` — intervalos + leituras de temperatura + serviços executados, ver RdoSuperestrutura em schema.prisma. */
async function montarDadosSuperestrutura(rdoId: string) {
  const dados = await prisma.rdoSuperestrutura.findUnique({
    where: { rdoId },
    select: {
      intervaloProgramadoInicio: true,
      intervaloProgramadoFim: true,
      intervaloRealizadoInicio: true,
      intervaloRealizadoFim: true,
      tempoTotalPerdas: true,
      leiturasTemperatura: { orderBy: { ordem: "asc" }, select: { hora: true, temperaturaC: true } },
      servicos: {
        orderBy: { ordem: "asc" },
        select: { codigo: true, descricao: true, unidade: true, quantidade: true, linha: true, kmInicial: true, kmFinal: true },
      },
    },
  });

  return {
    intervaloProgramadoInicio: dados?.intervaloProgramadoInicio ?? null,
    intervaloProgramadoFim: dados?.intervaloProgramadoFim ?? null,
    intervaloRealizadoInicio: dados?.intervaloRealizadoInicio ?? null,
    intervaloRealizadoFim: dados?.intervaloRealizadoFim ?? null,
    tempoTotalPerdas: dados?.tempoTotalPerdas ?? null,
    leiturasTemperatura: (dados?.leiturasTemperatura ?? []).map((l) => ({
      hora: l.hora,
      temperaturaC: l.temperaturaC != null ? Number(l.temperaturaC) : null,
    })),
    servicos: (dados?.servicos ?? []).map((s) => ({
      codigo: s.codigo,
      descricao: s.descricao,
      unidade: s.unidade,
      quantidade: s.quantidade != null ? Number(s.quantidade) : null,
      linha: s.linha,
      kmInicial: s.kmInicial != null ? Number(s.kmInicial) : null,
      kmFinal: s.kmFinal != null ? Number(s.kmFinal) : null,
    })),
  };
}

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
  // Fotos ficam fora do conteúdo hasheado (mesma lógica das assinaturas
  // abaixo) — os bytes de imagem não devem entrar no hash de autenticidade,
  // que precisa ficar estável e barato de recalcular.
  const gruposFotos = await montarGruposFotos(rdo.id);

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

  const buffer =
    rdo.tipo === "SUPERESTRUTURA"
      ? await gerarPdfRdoSuperestrutura({
          numeroSap: conteudo.numeroSap,
          liderNome: conteudo.encarregadoNome,
          frenteNome: conteudo.frenteNome,
          equipeNome: conteudo.equipeNome,
          data: conteudo.data,
          maoDeObra: conteudo.maoDeObra,
          equipamentos: conteudo.equipamentos,
          materiais: conteudo.materiais,
          observacoesContratada: conteudo.observacoesContratada,
          observacoesCliente: conteudo.observacoesCliente,
          ...(await montarDadosSuperestrutura(rdo.id)),
          urlVerificacao,
          assinaturaEncarregado,
          assinaturaFiscal,
        })
      : await gerarPdfRdo({ ...conteudo, urlVerificacao, assinaturaEncarregado, assinaturaFiscal, gruposFotos });

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
    const rdos = await prisma.rdo.findMany({ orderBy: { criadoEm: "desc" }, select: rdoListSelect });
    return rdos.map(comPdfDisponivel);
  });

  app.post("/rdos", async (request, reply) => {
    const data = parseBody(rdoDraftCreateInputSchema, request.body, reply);
    if (!data) return;

    const linkCampoExpiraEm = new Date();
    linkCampoExpiraEm.setDate(linkCampoExpiraEm.getDate() + LINK_CAMPO_DIAS_VALIDADE);

    try {
      const rdo = await comCodigoRastreio((codigoRastreio) =>
        prisma.rdo.create({
          data: { ...data, codigoRastreio, linkCampoToken: generateToken(), linkCampoExpiraEm },
          select: rdoListSelect,
        }),
      );
      return await reply.status(201).send(comPdfDisponivel(rdo));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.status(400).send({ error: "Frente ou equipe informada não existe" });
      }
      throw error;
    }
  });

  /**
   * Apaga um RDO ainda em rascunho — ex.: cadastrado errado/duplicado por
   * engano, antes de ir pra qualquer lugar (encarregado, escritório,
   * fiscal). Só permitido em RASCUNHO de propósito: depois que alguém já
   * viu ou mexeu no RDO (mesmo só validação do escritório), apagar em vez
   * de reprovar/corrigir apagaria histórico que outra pessoa já depende.
   */
  app.delete<{ Params: { id: string } }>("/rdos/:id", async (request, reply) => {
    const rdo = await prisma.rdo.findUnique({ where: { id: request.params.id }, select: { id: true, status: true } });
    if (!rdo) return reply.status(404).send({ error: "RDO não encontrado" });
    if (rdo.status !== "RASCUNHO") {
      return reply.status(409).send({ error: "Só é possível apagar um RDO enquanto ele está em rascunho" });
    }

    await prisma.$transaction([
      prisma.rdoBlocoHorario.deleteMany({ where: { rdoId: rdo.id } }),
      prisma.rdoAtividadeMaoDeObra.deleteMany({ where: { rdoAtividade: { rdoLocal: { rdoId: rdo.id } } } }),
      prisma.rdoAtividadePonto.deleteMany({ where: { rdoAtividade: { rdoLocal: { rdoId: rdo.id } } } }),
      prisma.rdoAtividade.deleteMany({ where: { rdoLocal: { rdoId: rdo.id } } }),
      prisma.rdoLocal.deleteMany({ where: { rdoId: rdo.id } }),
      prisma.rdoMaoDeObra.deleteMany({ where: { rdoId: rdo.id } }),
      prisma.rdoEquipamento.deleteMany({ where: { rdoId: rdo.id } }),
      prisma.rdoMaterial.deleteMany({ where: { rdoId: rdo.id } }),
      prisma.rdoAnexo.deleteMany({ where: { rdoId: rdo.id } }),
      prisma.rdo.delete({ where: { id: rdo.id } }),
    ]);

    return reply.status(204).send();
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
      const rdoId = await comCodigoRastreio((codigoRastreio) =>
        prisma.$transaction(async (tx) => {
          const rdo = await tx.rdo.create({
            data: {
              frenteId: data.frenteId,
              equipeId: data.equipeId,
              obraId: data.obraId,
              data: data.data,
              codigoRastreio,
              tipo: data.tipo,
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
                create: local.atividades.map((atividade) => montarDadosCriacaoAtividade(atividade)),
              },
            },
          });
        }

        if (data.tipo === "SUPERESTRUTURA" && data.superestrutura) {
          await tx.rdoSuperestrutura.create({
            data: {
              rdoId: rdo.id,
              intervaloProgramadoInicio: data.superestrutura.intervaloProgramadoInicio,
              intervaloProgramadoFim: data.superestrutura.intervaloProgramadoFim,
              intervaloRealizadoInicio: data.superestrutura.intervaloRealizadoInicio,
              intervaloRealizadoFim: data.superestrutura.intervaloRealizadoFim,
              tempoTotalPerdas: data.superestrutura.tempoTotalPerdas,
              leiturasTemperatura: { create: data.superestrutura.leiturasTemperatura },
              servicos: { create: data.superestrutura.servicos },
            },
          });
        }

          return rdo.id;
        }),
      );

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

    const [ordensManutencao, atividadesCatalogo, ultimaReprovacao, ultimosHorimetros] = await Promise.all([
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
      montarUltimosHorimetros(rdo.equipeId, rdo.data, rdo.id),
    ]);

    // Uma OM pode ser trabalhada ao longo de vários RDOs até ser dada como
    // concluída — pra sinalizar "faltam fotos" o front precisa do total já
    // lançado em OUTROS RDOs, não só nas fotos deste (que ele já tem em
    // `rdo.anexos`, atualizado ao vivo conforme o encarregado sobe fotos
    // nesta mesma sessão). rdoId != rdo.id evita contar 2x quando somado
    // com as fotos ao vivo deste RDO no front.
    const fotosPorOm =
      ordensManutencao.length > 0
        ? await prisma.rdoAnexo.groupBy({
            by: ["ordemManutencaoId", "descricao"],
            where: {
              ordemManutencaoId: { in: ordensManutencao.map((om) => om.id) },
              tipo: "FOTO",
              rdoId: { not: rdo.id },
            },
            _count: { _all: true },
          })
        : [];
    const contagemPorOm = new Map<string, { antes: number; depois: number }>();
    for (const linha of fotosPorOm) {
      if (!linha.ordemManutencaoId) continue;
      const atual = contagemPorOm.get(linha.ordemManutencaoId) ?? { antes: 0, depois: 0 };
      if (linha.descricao === "Antes") atual.antes += linha._count._all;
      if (linha.descricao === "Depois") atual.depois += linha._count._all;
      contagemPorOm.set(linha.ordemManutencaoId, atual);
    }
    const ordensManutencaoComFotos = ordensManutencao.map((om) => ({
      ...om,
      fotosAntesOutrosRdos: contagemPorOm.get(om.id)?.antes ?? 0,
      fotosDepoisOutrosRdos: contagemPorOm.get(om.id)?.depois ?? 0,
    }));

    return { rdo, ordensManutencao: ordensManutencaoComFotos, atividadesCatalogo, ultimaReprovacao, ultimosHorimetros };
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
          await substituirConteudoRdo(tx, rdoId, data);

          if (reabrindoAposReprovacao) {
            await tx.rdo.update({ where: { id: rdoId }, data: { status: "EM_CORRECAO" } });
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

  app.post<{
    Params: { token: string };
    Querystring: { tipo?: string; descricao?: string; ordemManutencaoId?: string };
  }>(
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

      const ordemManutencaoId = request.query.ordemManutencaoId || null;
      if (ordemManutencaoId) {
        const om = await prisma.ordemManutencao.findUnique({ where: { id: ordemManutencaoId }, select: { id: true } });
        if (!om) {
          return reply.status(400).send({ error: "Ordem de manutenção inválida" });
        }
      }

      const { caminhoArquivo } = await salvarArquivoAnexo(buffer, file.mimetype, rdo.id);

      const anexo = await prisma.rdoAnexo.create({
        data: {
          rdoId: rdo.id,
          tipo,
          caminhoArquivo,
          nomeOriginal: file.filename,
          mimeType: file.mimetype,
          tamanhoBytes: buffer.length,
          descricao: request.query.descricao ?? null,
          ordemManutencaoId,
        },
        select: {
          id: true,
          tipo: true,
          nomeOriginal: true,
          mimeType: true,
          tamanhoBytes: true,
          descricao: true,
          ordemManutencaoId: true,
          ordemManutencao: { select: { id: true, numero: true } },
          criadoEm: true,
        },
      });

      return await reply.status(201).send(anexo);
    },
  );

  /** Baixa/visualiza o arquivo de um anexo (foto, nota fiscal, documento). */
  app.get<{ Params: { id: string; anexoId: string } }>(
    "/rdos/:id/anexos/:anexoId",
    async (request, reply) => {
      const anexo = await prisma.rdoAnexo.findUnique({ where: { id: request.params.anexoId } });
      if (!anexo || anexo.rdoId !== request.params.id) {
        return reply.status(404).send({ error: "Anexo não encontrado" });
      }
      const buffer = await readFile(anexo.caminhoArquivo);
      return reply
        .header("Content-Type", anexo.mimeType)
        .header("Content-Disposition", `inline; filename="${anexo.nomeOriginal}"`)
        .send(buffer);
    },
  );

  /** Remove um anexo — só faz sentido enquanto o RDO ainda não foi assinado/enviado. */
  app.delete<{ Params: { id: string; anexoId: string } }>(
    "/rdos/:id/anexos/:anexoId",
    async (request, reply) => {
      const anexo = await prisma.rdoAnexo.findUnique({ where: { id: request.params.anexoId } });
      if (!anexo || anexo.rdoId !== request.params.id) {
        return reply.status(404).send({ error: "Anexo não encontrado" });
      }
      await prisma.rdoAnexo.delete({ where: { id: anexo.id } });
      return reply.status(204).send();
    },
  );

  /**
   * O encarregado finaliza o preenchimento e assina — diferente do PATCH
   * acima, que só salva o rascunho em progresso. Exige assinatura desenhada
   * (canvas) e pelo menos 1 local com atividade, mesma regra de "RDO
   * completo" (`rdoCreateInputSchema`).
   *
   * Não vai direto pro fiscal: fica em AGUARDANDO_VALIDACAO_ESCRITORIO até
   * o escritório revisar (e opcionalmente corrigir via `PATCH /rdos/:id`)
   * e acionar `POST /rdos/:id/enviar-fiscal`.
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
          tipo: true,
          linkCampoExpiraEm: true,
          encarregadoId: true,
          locais: { select: { atividades: { select: { id: true } } } },
          equipamentos: { select: { producaoValor: true, horimetroFinal: true } },
          superestrutura: { select: { servicos: { select: { id: true } } } },
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
      if (!rdoTemConteudo(rdo)) {
        return reply.status(400).send({ error: "Informe ao menos um local com atividade, ou a produção de algum equipamento, antes de enviar" });
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
            status: "AGUARDANDO_VALIDACAO_ESCRITORIO",
            assinaturaEncarregadoPath: caminhoAssinatura,
            enviadoParaFiscalEm: new Date(),
          },
        }),
        prisma.rdoHistorico.create({
          data: {
            rdoId: rdo.id,
            deStatus: rdo.status,
            paraStatus: "AGUARDANDO_VALIDACAO_ESCRITORIO",
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

    const ultimaDecisaoFiscal = await buscarUltimaDecisaoFiscal(rdo.id, rdo.status);

    return { ...rdo, ultimaDecisaoFiscal };
  });

  // Status em que o escritório ainda pode corrigir o conteúdo do RDO pelo
  // desktop — depois de AGUARDANDO_APROVACAO, quem edita é o fiscal
  // (aprovando/reprovando) ou, se reprovado, o encarregado de novo (via
  // link de campo, que reabre em EM_CORRECAO).
  const STATUS_EDITAVEL_ESCRITORIO = new Set(["RASCUNHO", "AGUARDANDO_VALIDACAO_ESCRITORIO", "EM_CORRECAO"]);

  /**
   * Edição do conteúdo de um RDO pelo escritório (desktop) — mesma forma
   * de salvar que `PATCH /rdos/campo/:token`, mas identificado pelo id (sem
   * token de link, sem expiração) e só permitido enquanto o RDO ainda não
   * foi pro fiscal. Usado principalmente pra revisar/corrigir o que o
   * encarregado mandou do celular antes de `POST /rdos/:id/enviar-fiscal`.
   */
  app.patch<{ Params: { id: string } }>("/rdos/:id", async (request, reply) => {
    const data = parseBody(rdoCampoUpdateInputSchema, request.body, reply);
    if (!data) return;

    const existente = await prisma.rdo.findUnique({ where: { id: request.params.id }, select: { id: true, status: true } });
    if (!existente) return reply.status(404).send({ error: "RDO não encontrado" });
    if (!STATUS_EDITAVEL_ESCRITORIO.has(existente.status)) {
      return reply.status(409).send({ error: "Este RDO não pode mais ser editado pelo escritório" });
    }

    try {
      await prisma.$transaction((tx) => substituirConteudoRdo(tx, existente.id, data));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        return reply.status(400).send({ error: "Ordem de manutenção, função, colaborador, equipamento ou material inválido" });
      }
      throw error;
    }

    if (existente.status !== "RASCUNHO") {
      await gerarEArmazenarPdf(existente.id);
    }

    return prisma.rdo.findUnique({ where: { id: existente.id }, select: rdoCampoSelect });
  });

  /**
   * O escritório revisou (e opcionalmente corrigiu via PATCH acima) o RDO
   * que o encarregado assinou no celular, e agora manda pro fiscal —
   * transição AGUARDANDO_VALIDACAO_ESCRITORIO -> AGUARDANDO_APROVACAO.
   * Antes disso o RDO não aparece no portal do fiscal.
   */
  app.post<{ Params: { id: string } }>("/rdos/:id/enviar-fiscal", async (request, reply) => {
    const rdo = await prisma.rdo.findUnique({
      where: { id: request.params.id },
      select: {
        id: true,
        status: true,
        tipo: true,
        data: true,
        frenteId: true,
        frente: { select: { nome: true } },
        equipe: { select: { nome: true } },
        locais: { select: { atividades: { select: { id: true } } } },
        equipamentos: { select: { producaoValor: true, horimetroFinal: true } },
        superestrutura: { select: { servicos: { select: { id: true } } } },
      },
    });
    if (!rdo) return reply.status(404).send({ error: "RDO não encontrado" });
    if (rdo.status !== "AGUARDANDO_VALIDACAO_ESCRITORIO") {
      return reply.status(409).send({ error: "Este RDO não está aguardando validação do escritório" });
    }
    if (!rdoTemConteudo(rdo)) {
      return reply.status(400).send({ error: "Informe ao menos um local com atividade, ou a produção de algum equipamento, antes de enviar" });
    }

    await prisma.$transaction([
      prisma.rdo.update({ where: { id: rdo.id }, data: { status: "AGUARDANDO_APROVACAO" } }),
      prisma.rdoHistorico.create({
        data: { rdoId: rdo.id, deStatus: "AGUARDANDO_VALIDACAO_ESCRITORIO", paraStatus: "AGUARDANDO_APROVACAO", ator: "Escritório" },
      }),
    ]);

    await gerarEArmazenarPdf(rdo.id);
    await notificarFiscaisRdoAguardando(rdo);
    return prisma.rdo.findUnique({ where: { id: rdo.id }, select: rdoCampoSelect });
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
