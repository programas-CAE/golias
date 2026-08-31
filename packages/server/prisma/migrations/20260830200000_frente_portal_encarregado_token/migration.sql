-- AlterTable
ALTER TABLE "Frente" ADD COLUMN     "portalEncarregadoToken" TEXT;
CREATE UNIQUE INDEX "Frente_portalEncarregadoToken_key" ON "Frente"("portalEncarregadoToken");
