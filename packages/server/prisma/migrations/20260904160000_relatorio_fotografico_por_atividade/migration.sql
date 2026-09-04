-- AlterTable
ALTER TABLE "Rdo" ALTER COLUMN "codigoRastreio" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "RdoAnexo" ADD COLUMN     "atividadeCatalogoId" TEXT;

-- AlterTable
ALTER TABLE "RelatorioFotograficoFoto" ADD COLUMN     "atividadeCatalogoId" TEXT;

-- AddForeignKey
ALTER TABLE "RelatorioFotograficoFoto" ADD CONSTRAINT "RelatorioFotograficoFoto_atividadeCatalogoId_fkey" FOREIGN KEY ("atividadeCatalogoId") REFERENCES "AtividadeCatalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoAnexo" ADD CONSTRAINT "RdoAnexo_atividadeCatalogoId_fkey" FOREIGN KEY ("atividadeCatalogoId") REFERENCES "AtividadeCatalogo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
