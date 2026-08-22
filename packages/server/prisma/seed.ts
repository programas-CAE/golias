import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ATIVIDADES, COLABORADORES, CONTRATOS, EQUIPAMENTOS, FRENTES, FUNCOES } from "@golias/shared";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv, requireEnv } from "../src/lib/loadEnv.js";

loadEnv("../.env", import.meta.url);

const adapter = new PrismaPg(requireEnv("DATABASE_URL"));
const prisma = new PrismaClient({ adapter });

async function seedContratos(): Promise<void> {
  for (const contrato of CONTRATOS) {
    await prisma.contrato.upsert({
      where: { numero: contrato.numero },
      update: { nome: contrato.nome },
      create: { numero: contrato.numero, nome: contrato.nome },
    });
  }
  console.log(`Contratos: ${CONTRATOS.length} sincronizados.`);
}

/** Depende de `seedContratos` (Frente.contratoId é obrigatório). */
async function seedFrentes(): Promise<void> {
  const contratos = await prisma.contrato.findMany();
  const contratoIdPorNumero = new Map(contratos.map((contrato) => [contrato.numero, contrato.id]));

  for (const frente of FRENTES) {
    const contratoId = contratoIdPorNumero.get(frente.contratoNumero);
    if (!contratoId) {
      console.warn(`Contrato "${frente.contratoNumero}" não encontrado para a frente ${frente.nome}, pulando.`);
      continue;
    }
    const existente = await prisma.frente.findUnique({ where: { codigo: frente.codigo } });
    await prisma.frente.upsert({
      where: { codigo: frente.codigo },
      // Só aplica o contrato do seed se ainda não foi definido — não
      // sobrescreve um vínculo que o usuário já ajustou pela tela de Frentes.
      update: { nome: frente.nome, ...(existente?.contratoId == null ? { contratoId } : {}) },
      create: { codigo: frente.codigo, nome: frente.nome, contratoId },
    });
  }
  console.log(`Frentes: ${FRENTES.length} sincronizadas.`);
}

/**
 * Colaboradores dependem das funções já existirem (funcaoId é obrigatório),
 * por isso rodam depois de `seedFuncoes`.
 */
async function seedColaboradores(): Promise<void> {
  const nomesFuncoes = [...new Set(COLABORADORES.map((colaborador) => colaborador.funcao))];
  const funcoes = await prisma.funcaoCatalogo.findMany({ where: { nome: { in: nomesFuncoes } } });
  const funcaoIdPorNome = new Map(funcoes.map((funcao) => [funcao.nome, funcao.id]));

  let sincronizados = 0;
  for (const colaborador of COLABORADORES) {
    const funcaoId = funcaoIdPorNome.get(colaborador.funcao);
    if (!funcaoId) {
      console.warn(`Função "${colaborador.funcao}" não encontrada para o colaborador ${colaborador.nome}, pulando.`);
      continue;
    }
    await prisma.colaborador.upsert({
      where: { matricula: colaborador.matricula },
      update: { nome: colaborador.nome, funcaoId },
      create: { matricula: colaborador.matricula, nome: colaborador.nome, funcaoId },
    });
    sincronizados += 1;
  }
  console.log(`Colaboradores: ${sincronizados} sincronizados.`);
}

async function seedFuncoes(): Promise<void> {
  for (const funcao of FUNCOES) {
    await prisma.funcaoCatalogo.upsert({
      where: { nome: funcao.nome },
      update: {},
      create: { nome: funcao.nome },
    });
  }
  console.log(`Funções: ${FUNCOES.length} sincronizadas.`);
}

async function seedEquipamentos(): Promise<void> {
  for (const equipamento of EQUIPAMENTOS) {
    await prisma.equipamentoCatalogo.upsert({
      where: { nome: equipamento.nome },
      update: {},
      create: { nome: equipamento.nome },
    });
  }
  console.log(`Equipamentos: ${EQUIPAMENTOS.length} sincronizados.`);
}

/**
 * AtividadeCatalogo não tem uma coluna unívoca de `codigo` — o catálogo
 * oficial do cliente repete o código "2.1.7" em duas atividades distintas
 * (ver packages/shared/src/constants/catalogo.ts). Por isso, o "upsert"
 * aqui é feito manualmente casando por (codigo, descricao), em vez de usar
 * `prisma.atividadeCatalogo.upsert`, que exigiria uma constraint única.
 */
async function seedAtividades(): Promise<void> {
  let criadas = 0;
  let atualizadas = 0;

  for (const atividade of ATIVIDADES) {
    const existente = await prisma.atividadeCatalogo.findFirst({
      where: { codigo: atividade.codigo, descricao: atividade.descricao },
    });

    if (existente) {
      await prisma.atividadeCatalogo.update({
        where: { id: existente.id },
        data: {
          unidade: atividade.unidade,
          usaDimensoes: atividade.usaDimensoes,
          ordem: atividade.ordem,
          // Só aplica o metaPus do seed se ainda não foi definido — não
          // sobrescreve um valor que o usuário já ajustou manualmente pela
          // tela "Catálogo de Atividades".
          ...(existente.metaPus == null && atividade.metaPus != null ? { metaPus: atividade.metaPus } : {}),
        },
      });
      atualizadas += 1;
    } else {
      await prisma.atividadeCatalogo.create({
        data: {
          codigo: atividade.codigo,
          descricao: atividade.descricao,
          unidade: atividade.unidade,
          metaPus: atividade.metaPus,
          usaDimensoes: atividade.usaDimensoes,
          ordem: atividade.ordem,
        },
      });
      criadas += 1;
    }
  }

  console.log(`Atividades: ${criadas} criadas, ${atualizadas} atualizadas (total ${ATIVIDADES.length}).`);
}

interface MaterialCatalogoRegistro {
  codigo: string;
  descricao: string;
  unidade: string | null;
  precoUnitario: number | null;
}

/**
 * Catálogo oficial de materiais/serviços com preço unitário — Price List do
 * contrato (planilha "09ª Medição INFRA IV_PA - Planilha de Medição Rev.04
 * Correção.xlsx", aba "Price_List_Material", 217 itens reais). Depende de
 * `seedContratos` (MaterialCatalogo.contratoId é obrigatório).
 */
async function seedMateriais(): Promise<void> {
  const caminho = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "materialCatalogo.json");
  const registros = JSON.parse(readFileSync(caminho, "utf-8")) as MaterialCatalogoRegistro[];

  const contrato = await prisma.contrato.findUnique({ where: { numero: CONTRATOS[0].numero } });
  if (!contrato) {
    console.warn("Contrato não encontrado, pulando seed de materiais.");
    return;
  }

  let sincronizados = 0;
  for (const registro of registros) {
    if (!registro.unidade) continue;
    await prisma.materialCatalogo.upsert({
      where: { contratoId_codigo: { contratoId: contrato.id, codigo: registro.codigo } },
      update: { descricao: registro.descricao, unidade: registro.unidade, precoUnitario: registro.precoUnitario },
      create: {
        contratoId: contrato.id,
        codigo: registro.codigo,
        descricao: registro.descricao,
        unidade: registro.unidade,
        precoUnitario: registro.precoUnitario,
      },
    });
    sincronizados += 1;
  }
  console.log(`Materiais: ${sincronizados} sincronizados.`);
}

interface MedicaoHistoricaRegistro {
  mes: string; // "YYYY-MM"
  frenteCodigo: "MAB" | "PBA" | "RAMAL";
  codigo: string;
  marcador: string | null;
  quantidade: number;
}

/**
 * Backfill da produção real de abril/maio/junho de 2026 — meses anteriores
 * à existência do GOLIAS, extraídos de "PRODUTIVIDADE ABRIL MAIO
 * JUNHO.xlsx" (packages/server/prisma/data/medicaoHistorica.json). Não há
 * RDO por trás desses números (já vieram fechados/agregados da ENGECOM),
 * então entram direto em PeriodoMedicao/MedicaoItem — o mesmo lugar onde
 * cairá a medição gerada a partir de RDOs reais no futuro (Fase 5).
 *
 * O código "2.1.7" se repete para duas atividades distintas no catálogo
 * oficial (ver comentário em packages/shared/src/constants/catalogo.ts);
 * `marcador` ("valas" ou "taludes") desambigua qual delas o registro é.
 */
async function seedMedicoesHistoricas(): Promise<void> {
  const caminho = path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "medicaoHistorica.json");
  const registros = JSON.parse(readFileSync(caminho, "utf-8")) as MedicaoHistoricaRegistro[];

  const frentes = await prisma.frente.findMany();
  const frenteIdPorCodigo = new Map(frentes.map((frente) => [frente.codigo, frente.id]));
  const atividades = await prisma.atividadeCatalogo.findMany();

  function resolverAtividade(codigo: string, marcador: string | null) {
    const candidatas = atividades.filter((atividade) => atividade.codigo === codigo);
    if (candidatas.length <= 1) return candidatas[0];
    return marcador ? candidatas.find((atividade) => atividade.descricao.toLowerCase().includes(marcador)) : undefined;
  }

  const periodosCache = new Map<string, string>();
  let itensSincronizados = 0;
  let itensIgnorados = 0;

  for (const registro of registros) {
    const frenteId = frenteIdPorCodigo.get(registro.frenteCodigo);
    const atividade = resolverAtividade(registro.codigo, registro.marcador);
    if (!frenteId || !atividade) {
      itensIgnorados += 1;
      continue;
    }

    const [anoStr, mesStr] = registro.mes.split("-");
    const ano = Number(anoStr);
    const mes = Number(mesStr);
    const chavePeriodo = `${frenteId}-${ano}-${mes}`;

    let periodoMedicaoId = periodosCache.get(chavePeriodo);
    if (!periodoMedicaoId) {
      const periodo = await prisma.periodoMedicao.upsert({
        where: { frenteId_ano_mes: { frenteId, ano, mes } },
        update: {},
        create: { frenteId, ano, mes },
      });
      periodoMedicaoId = periodo.id;
      periodosCache.set(chavePeriodo, periodoMedicaoId);
    }

    await prisma.medicaoItem.upsert({
      where: { periodoMedicaoId_atividadeCatalogoId: { periodoMedicaoId, atividadeCatalogoId: atividade.id } },
      update: { quantidadeTotal: registro.quantidade, unidade: atividade.unidade },
      create: {
        periodoMedicaoId,
        atividadeCatalogoId: atividade.id,
        quantidadeTotal: registro.quantidade,
        unidade: atividade.unidade,
      },
    });
    itensSincronizados += 1;
  }

  if (itensIgnorados > 0) {
    console.warn(`Medições históricas: ${itensIgnorados} registro(s) ignorado(s) (frente ou atividade não encontrada).`);
  }
  console.log(`Medições históricas: ${itensSincronizados} itens sincronizados em ${periodosCache.size} períodos.`);
}

async function main(): Promise<void> {
  console.log("Iniciando seed do catálogo GOLIAS...");
  await seedContratos();
  await seedFrentes();
  await seedFuncoes();
  await seedColaboradores();
  await seedEquipamentos();
  await seedAtividades();
  await seedMateriais();
  await seedMedicoesHistoricas();
  console.log("Seed concluído com sucesso.");
}

main()
  .catch((error: unknown) => {
    console.error(
      "Falha ao executar o seed. Verifique se DATABASE_URL está definido " +
        "e se o banco de dados Postgres está acessível (docker-compose up -d db).",
    );
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
