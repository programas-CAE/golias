-- DropForeignKey
ALTER TABLE "RelatorioFotograficoFoto" DROP CONSTRAINT "RelatorioFotograficoFoto_rdoAnexoId_fkey";

-- AlterTable
ALTER TABLE "Rdo" ALTER COLUMN "codigoRastreio" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "RelatorioFotograficoFoto" ADD COLUMN     "ativa" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "RelatorioFotograficoFoto" ADD CONSTRAINT "RelatorioFotograficoFoto_rdoAnexoId_fkey" FOREIGN KEY ("rdoAnexoId") REFERENCES "RdoAnexo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
