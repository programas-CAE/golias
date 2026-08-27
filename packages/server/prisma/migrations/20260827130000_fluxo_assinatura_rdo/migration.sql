-- AlterTable
ALTER TABLE "Frente" ADD COLUMN     "portalFiscalToken" TEXT;
CREATE UNIQUE INDEX "Frente_portalFiscalToken_key" ON "Frente"("portalFiscalToken");

-- AlterTable
ALTER TABLE "Rdo" ADD COLUMN     "assinaturaEncarregadoPath" TEXT;

-- AlterTable
ALTER TABLE "AprovacaoFiscal" ADD COLUMN     "assinaturaImagemPath" TEXT;
