/*
  Warnings:

  - You are about to drop the column `horarioFinal` on the `Rdo` table. All the data in the column will be lost.
  - You are about to drop the column `horarioInicial` on the `Rdo` table. All the data in the column will be lost.
  - You are about to drop the column `ordemManutencaoId` on the `Rdo` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Rdo" DROP CONSTRAINT "Rdo_ordemManutencaoId_fkey";

-- AlterTable
ALTER TABLE "Frente" ADD COLUMN     "numeroSap" TEXT;

-- AlterTable
ALTER TABLE "Rdo" DROP COLUMN "horarioFinal",
DROP COLUMN "horarioInicial",
DROP COLUMN "ordemManutencaoId",
ADD COLUMN     "horaExtraFim" TEXT,
ADD COLUMN     "horaExtraInicio" TEXT;

-- AlterTable
ALTER TABLE "RdoLocal" ADD COLUMN     "ordemManutencaoId" TEXT;

-- CreateTable
CREATE TABLE "RdoBlocoHorario" (
    "id" TEXT NOT NULL,
    "rdoId" TEXT NOT NULL,
    "horarioInicial" TEXT NOT NULL,
    "horarioFinal" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RdoBlocoHorario_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RdoBlocoHorario" ADD CONSTRAINT "RdoBlocoHorario_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoLocal" ADD CONSTRAINT "RdoLocal_ordemManutencaoId_fkey" FOREIGN KEY ("ordemManutencaoId") REFERENCES "OrdemManutencao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
