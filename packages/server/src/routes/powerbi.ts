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
        rdoLocal: {
          select: {
            rdo: {
              select: {
                id: true,
                data: true,
                frente: { select: { nome: true, contrato: { select: { numero: true } } } },
                equipe: { select: { nome: true } },
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
        Contrato: rdo.frente.contrato.numero,
        Distrito: rdo.frente.nome,
        Equipe: rdo.equipe.nome,
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
      };
    });

    return linhas;
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
}
