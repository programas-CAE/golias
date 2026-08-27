-- CreateEnum
CREATE TYPE "StatusOmDeclarado" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA');

-- DropForeignKey
ALTER TABLE "EquipeMembro" DROP CONSTRAINT "EquipeMembro_colaboradorId_fkey";

-- AlterTable
ALTER TABLE "RdoAtividade" ADD COLUMN     "horarioFinal" TEXT,
ADD COLUMN     "horarioInicial" TEXT,
ADD COLUMN     "statusOm" "StatusOmDeclarado";

-- CreateTable
CREATE TABLE "RdoAtividadeMaoDeObra" (
    "id" TEXT NOT NULL,
    "rdoAtividadeId" TEXT NOT NULL,
    "funcaoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RdoAtividadeMaoDeObra_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoAtividadeMaoDeObra" ADD CONSTRAINT "RdoAtividadeMaoDeObra_rdoAtividadeId_fkey" FOREIGN KEY ("rdoAtividadeId") REFERENCES "RdoAtividade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoAtividadeMaoDeObra" ADD CONSTRAINT "RdoAtividadeMaoDeObra_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "FuncaoCatalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
