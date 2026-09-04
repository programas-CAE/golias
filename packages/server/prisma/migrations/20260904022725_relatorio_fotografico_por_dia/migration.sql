
-- DropIndex
DROP INDEX "RelatorioFotografico_ordemManutencaoId_key";

-- AlterTable
ALTER TABLE "Rdo" ALTER COLUMN "codigoRastreio" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "RelatorioFotografico" ADD COLUMN     "rdoId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RelatorioFotografico_ordemManutencaoId_rdoId_key" ON "RelatorioFotografico"("ordemManutencaoId", "rdoId");

-- AddForeignKey
ALTER TABLE "RelatorioFotografico" ADD CONSTRAINT "RelatorioFotografico_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

