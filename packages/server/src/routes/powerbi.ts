import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";

/**
 * Fonte de dados só-leitura para o Power BI (conector "Web"), no formato
 * da planilha "Base_Produtividade_Equipes_Preventivas.xlsx" (aba
 * Fato_RDO_Detalhe + as dimensões) — assim o modelo/relatório já pronto no
 * Power BI Desktop troca a fonte do Excel para esta API sem remodelar
 * nada. Não expõe o banco diretamente (nem um usuário read-only): cada
 * rota é filtrada e só devolve o que essas telas precisam.
 *
 * Protegida por um token fixo (não é o mesmo mecanismo dos links públicos
 * de campo/portal fiscal, que expiram ou são por frente) — o Power BI
 * chama por trás, sem UI, então um único token de aplicação em
 * POWERBI_API_TOKEN (variável de ambiente) já é suficiente.
 */
function autenticarPowerBi(request: FastifyRequest, reply: FastifyReply): boolean {
  const tokenEsperado = process.env.POWERBI_API_TOKEN;
  const tokenRecebido = (request.query as { token?: string }).token;
  if (!tokenEsperado || tokenRecebido !== tokenEsperado) {
    reply.status(401).send({ error: "Token inválido ou não configurado" });
    return false;
  }
  return true;
}

export function registerPowerBiRoutes(app: FastifyInstance): void {
  /**
   * Uma linha por atividade de RDO aprovado — a granularidade mais fina,
   * de onde o Power BI deriva o resto (produção mensal, efetivo, PUS por
   * colaborador/distrito) via Power Query/DAX. Só RDOs APROVADO: dado
   * ainda em rascunho/aguardando aprovação não é produção fechada.
   */
  app.get("/powerbi/fato-rdo-detalhe", async (request, reply) => {
    if (!autenticarPowerBi(request, reply)) return;

    const atividades = await prisma.rdoAtividade.findMany({
      where: { rdoLocal: { rdo: { status: "APROVADO" } } },
      select: {
        id: true,
        atividadeCatalogo: { select: { codigo: true, descricao: true, metaPus: true } },
        unidade: true,
        totalCalculado: true,
        maoObraDireta: true,
        horasTrabalhadas: true,
        ordemManutencao: { select: { numero: true } },
        statusOm: true,
        percentualConcluido: true,
        rdoLocal: {
          select: {
            rdo: {
              select: {
                id: true,
                data: true,
                tipo: true,
                frente: { select: { nome: true, contrato: { select: { numero: true } } } },
                equipe: { select: { nome: true } },
                obra: { select: { nome: true } },
                encarregadoId: true,
              },
            },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    const encarregadoIds = [...new Set(atividades.map((a) => a.rdoLocal.rdo.encarregadoId).filter((id): id is string => id != null))];
    const encarregados =
      encarregadoIds.length > 0
        ? await prisma.colaborador.findMany({ where: { id: { in: encarregadoIds } }, select: { id: true, nome: true } })
        : [];
    const nomePorEncarregadoId = new Map(encarregados.map((c) => [c.id, c.nome]));

    const linhas = atividades.map((atividade) => {
      const rdo = atividade.rdoLocal.rdo;
      const producao = Number(atividade.totalCalculado);
      const maoObra = atividade.maoObraDireta;
      const horas = atividade.horasTrabalhadas != null ? Number(atividade.horasTrabalhadas) : null;
      const metaPus = atividade.atividadeCatalogo.metaPus != null ? Number(atividade.atividadeCatalogo.metaPus) : null;
      const homensHora = maoObra != null && horas != null ? maoObra * horas : null;
      const pusCalculado = homensHora != null && homensHora > 0 ? producao / homensHora : null;
      const eficienciaCalculada = pusCalculado != null && metaPus != null && metaPus > 0 ? (pusCalculado / metaPus) * 100 : null;

      return {
        Data: rdo.data.toISOString().slice(0, 10),
        Data_Inicio: rdo.data.toISOString().slice(0, 10),
        RDO: rdo.id,
        Tipo_RDO: rdo.tipo,
        Contrato: rdo.frente.contrato.numero,
        Distrito: rdo.frente.nome,
        Equipe: rdo.equipe.nome,
        Obra: rdo.obra?.nome ?? null,
        Colaborador: rdo.encarregadoId ? (nomePorEncarregadoId.get(rdo.encarregadoId) ?? null) : null,
        Atividade_Codigo: atividade.atividadeCatalogo.codigo,
        Atividade_Descricao: atividade.atividadeCatalogo.descricao,
        Unidade: atividade.unidade,
        Producao: producao,
        Mao_Obra_Direta: maoObra,
        PUS_Referencia: metaPus,
        PUS_Sistema: null,
        Horas_Trabalhadas: horas,
        PUS_Calculado: pusCalculado,
        Eficiencia_Calculada: eficienciaCalculada,
        Homens_Hora: homensHora,
        OM_Numero: atividade.ordemManutencao?.numero ?? null,
        Status_OM: atividade.statusOm,
        Percentual_Concluido_OM: atividade.percentualConcluido,
      };
    });

    return linhas;
  });

  /**
   * Uma linha por equipamento de RDO aprovado — cobre o que Fato_RDO_Detalhe
   * não pega: produção/horímetro por máquina (Terraplenagem) e km/rota/
   * combustível (Motorista/Operador), que vivem em RdoEquipamento, não em
   * RdoAtividade. Cada lançamento vira uma linha nova (nunca sobrescreve um
   * dia anterior), então o histórico completo já fica registrado no banco
   * desde a criação do RDO — esta rota só espelha ele pro Power BI.
   */
  app.get("/powerbi/fato-rdo-equipamento", async (request, reply) => {
    if (!autenticarPowerBi(request, reply)) return;

    const equipamentos = await prisma.rdoEquipamento.findMany({
      where: { rdo: { status: "APROVADO" } },
      select: {
        id: true,
        equipamentoCatalogo: { select: { nome: true } },
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
        rdo: {
          select: {
            id: true,
            data: true,
            tipo: true,
            frente: { select: { nome: true, contrato: { select: { numero: true } } } },
            equipe: { select: { nome: true } },
            obra: { select: { nome: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    return equipamentos.map((item) => ({
      Data: item.rdo.data.toISOString().slice(0, 10),
      RDO: item.rdo.id,
      Tipo_RDO: item.rdo.tipo,
      Contrato: item.rdo.frente.contrato.numero,
      Distrito: item.rdo.frente.nome,
      Equipe: item.rdo.equipe.nome,
      Obra: item.rdo.obra?.nome ?? null,
      Equipamento: item.equipamentoCatalogo.nome,
      Quantidade: item.quantidade,
      Producao_Descricao: item.producaoDescricao,
      Producao_Valor: item.producaoValor != null ? Number(item.producaoValor) : null,
      Producao_Unidade: item.producaoUnidade,
      Horimetro_Inicial: item.horimetroInicial != null ? Number(item.horimetroInicial) : null,
      Horimetro_Final: item.horimetroFinal != null ? Number(item.horimetroFinal) : null,
      Km_Inicial: item.kmInicial != null ? Number(item.kmInicial) : null,
      Km_Final: item.kmFinal != null ? Number(item.kmFinal) : null,
      Km_Percorrido: item.kmInicial != null && item.kmFinal != null ? Number(item.kmFinal) - Number(item.kmInicial) : null,
      Rota: item.rota,
      Combustivel_Litros: item.combustivelLitros != null ? Number(item.combustivelLitros) : null,
      Combustivel_Posto: item.combustivelPosto,
    }));
  });

  /** Uma linha por material lançado num RDO aprovado (RdoMaterial) — não tinha exportação nenhuma antes. */
  app.get("/powerbi/fato-rdo-material", async (request, reply) => {
    if (!autenticarPowerBi(request, reply)) return;

    const materiais = await prisma.rdoMaterial.findMany({
      where: { rdo: { status: "APROVADO" } },
      select: {
        id: true,
        quantidade: true,
        materialCatalogo: { select: { codigo: true, descricao: true, unidade: true, precoUnitario: true } },
        rdo: {
          select: {
            id: true,
            data: true,
            tipo: true,
            frente: { select: { nome: true, contrato: { select: { numero: true } } } },
            equipe: { select: { nome: true } },
            obra: { select: { nome: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    return materiais.map((item) => {
      const quantidade = Number(item.quantidade);
      const precoUnitario = item.materialCatalogo.precoUnitario != null ? Number(item.materialCatalogo.precoUnitario) : null;
      return {
        Data: item.rdo.data.toISOString().slice(0, 10),
        RDO: item.rdo.id,
        Tipo_RDO: item.rdo.tipo,
        Contrato: item.rdo.frente.contrato.numero,
        Distrito: item.rdo.frente.nome,
        Equipe: item.rdo.equipe.nome,
        Obra: item.rdo.obra?.nome ?? null,
        Material_Codigo: item.materialCatalogo.codigo,
        Material_Descricao: item.materialCatalogo.descricao,
        Unidade: item.materialCatalogo.unidade,
        Quantidade: quantidade,
        Preco_Unitario: precoUnitario,
        Valor_Total: precoUnitario != null ? quantidade * precoUnitario : null,
      };
    });
  });

  /**
   * Uma linha por função de efetivo lançada num RDO aprovado (RdoMaoDeObra)
   * — o dia inteiro da equipe, não só a mão de obra direta que já sai
   * agregada por atividade em Fato_RDO_Detalhe.
   */
  app.get("/powerbi/fato-rdo-mao-de-obra", async (request, reply) => {
    if (!autenticarPowerBi(request, reply)) return;

    const itens = await prisma.rdoMaoDeObra.findMany({
      where: { rdo: { status: "APROVADO" } },
      select: {
        id: true,
        quantidade: true,
        horasImprodutivas: true,
        causaImprodutividade: true,
        funcao: { select: { nome: true } },
        colaborador: { select: { nome: true } },
        rdo: {
          select: {
            id: true,
            data: true,
            tipo: true,
            frente: { select: { nome: true, contrato: { select: { numero: true } } } },
            equipe: { select: { nome: true } },
            obra: { select: { nome: true } },
          },
        },
      },
      orderBy: { id: "asc" },
    });

    return itens.map((item) => ({
      Data: item.rdo.data.toISOString().slice(0, 10),
      RDO: item.rdo.id,
      Tipo_RDO: item.rdo.tipo,
      Contrato: item.rdo.frente.contrato.numero,
      Distrito: item.rdo.frente.nome,
      Equipe: item.rdo.equipe.nome,
      Obra: item.rdo.obra?.nome ?? null,
      Funcao: item.funcao.nome,
      Colaborador: item.colaborador?.nome ?? null,
      Quantidade: item.quantidade,
      Horas_Improdutivas: item.horasImprodutivas != null ? Number(item.horasImprodutivas) : null,
      Causa_Improdutividade: item.causaImprodutividade,
    }));
  });

  /** Réplica de Dim_Atividade — catálogo oficial, ativo ou não (o Power BI decide se filtra). */
  app.get("/powerbi/dim-atividade", async (request, reply) => {
    if (!autenticarPowerBi(request, reply)) return;

    const atividades = await prisma.atividadeCatalogo.findMany({
      orderBy: { ordem: "asc" },
      select: { codigo: true, descricao: true, unidade: true, metaPus: true },
    });

    return atividades.map((atividade) => ({
      Atividade_Codigo: atividade.codigo,
      Atividade_Descricao: atividade.descricao,
      Unidade: atividade.unidade,
      Meta_PUS_Padrao: atividade.metaPus != null ? Number(atividade.metaPus) : null,
    }));
  });

  /**
   * Réplica de Dim_Distrito — "Distrito" na planilha de referência é, na
   * prática, a Frente do GOLIAS (Marabá/Parauapebas/Canaã); o Distrito do
   * GOLIAS é uma subdivisão de dentro da frente, sem equivalente na
   * planilha antiga.
   */
  app.get("/powerbi/dim-distrito", async (request, reply) => {
    if (!autenticarPowerBi(request, reply)) return;

    const frentes = await prisma.frente.findMany({
      orderBy: { nome: "asc" },
      select: { nome: true, codigo: true },
    });

    return frentes.map((frente) => ({ Distrito: frente.nome, Sigla_Origem: frente.codigo }));
  });

  /** Réplica de Dim_Obra — projetos cadastrados na tela Obras, ativos ou não. */
  app.get("/powerbi/dim-obra", async (request, reply) => {
    if (!autenticarPowerBi(request, reply)) return;

    const obras = await prisma.obra.findMany({
      orderBy: { nome: "asc" },
      select: { nome: true, ativo: true },
    });

    return obras.map((obra) => ({ Obra: obra.nome, Ativo: obra.ativo }));
  });
}
