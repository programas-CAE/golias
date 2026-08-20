import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ATIVIDADES, EQUIPAMENTOS, FRENTES, FUNCOES } from "@golias/shared";
import { loadEnv, requireEnv } from "../src/lib/loadEnv.js";

loadEnv("../.env", import.meta.url);

const adapter = new PrismaPg(requireEnv("DATABASE_URL"));
const prisma = new PrismaClient({ adapter });

async function seedFrentes(): Promise<void> {
  for (const frente of FRENTES) {
    await prisma.frente.upsert({
      where: { codigo: frente.codigo },
      update: { nome: frente.nome },
      create: { codigo: frente.codigo, nome: frente.nome },
    });
  }
  console.log(`Frentes: ${FRENTES.length} sincronizadas.`);
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
        },
      });
      atualizadas += 1;
    } else {
      await prisma.atividadeCatalogo.create({
        data: {
          codigo: atividade.codigo,
          descricao: atividade.descricao,
          unidade: atividade.unidade,
          usaDimensoes: atividade.usaDimensoes,
          ordem: atividade.ordem,
        },
      });
      criadas += 1;
    }
  }

  console.log(`Atividades: ${criadas} criadas, ${atualizadas} atualizadas (total ${ATIVIDADES.length}).`);
}

async function main(): Promise<void> {
  console.log("Iniciando seed do catálogo GOLIAS...");
  await seedFrentes();
  await seedFuncoes();
  await seedEquipamentos();
  await seedAtividades();
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
