-- DropForeignKey
ALTER TABLE "RdoLocal" DROP CONSTRAINT "RdoLocal_ordemManutencaoId_fkey";

-- AlterTable
ALTER TABLE "RdoLocal" DROP COLUMN "ordemManutencaoId";

-- AlterTable
ALTER TABLE "RdoAtividade" ADD COLUMN     "ordemManutencaoId" TEXT;

-- AddForeignKey
ALTER TABLE "RdoAtividade" ADD CONSTRAINT "RdoAtividade_ordemManutencaoId_fkey" FOREIGN KEY ("ordemManutencaoId") REFERENCES "OrdemManutencao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
