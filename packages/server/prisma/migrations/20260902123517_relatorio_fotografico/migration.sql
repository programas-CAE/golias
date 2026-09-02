-- AlterTable
ALTER TABLE "Rdo" ALTER COLUMN "codigoRastreio" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "RdoAnexo" ADD COLUMN     "ordemManutencaoId" TEXT;

-- CreateTable
CREATE TABLE "RelatorioFotografico" (
    "id" TEXT NOT NULL,
    "ordemManutencaoId" TEXT NOT NULL,
    "dataConclusao" DATE,
    "atividadesExecutadas" BOOLEAN NOT NULL DEFAULT true,
    "comentarios" TEXT,
    "pdfPath" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelatorioFotografico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelatorioFotograficoFoto" (
    "id" TEXT NOT NULL,
    "relatorioFotograficoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "legenda" TEXT,
    "rdoAnexoId" TEXT,
    "caminhoArquivo" TEXT,
    "nomeOriginal" TEXT,
    "mimeType" TEXT,
    "tamanhoBytes" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatorioFotograficoFoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RelatorioFotografico_ordemManutencaoId_key" ON "RelatorioFotografico"("ordemManutencaoId");

-- AddForeignKey
ALTER TABLE "RelatorioFotografico" ADD CONSTRAINT "RelatorioFotografico_ordemManutencaoId_fkey" FOREIGN KEY ("ordemManutencaoId") REFERENCES "OrdemManutencao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatorioFotograficoFoto" ADD CONSTRAINT "RelatorioFotograficoFoto_relatorioFotograficoId_fkey" FOREIGN KEY ("relatorioFotograficoId") REFERENCES "RelatorioFotografico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatorioFotograficoFoto" ADD CONSTRAINT "RelatorioFotograficoFoto_rdoAnexoId_fkey" FOREIGN KEY ("rdoAnexoId") REFERENCES "RdoAnexo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoAnexo" ADD CONSTRAINT "RdoAnexo_ordemManutencaoId_fkey" FOREIGN KEY ("ordemManutencaoId") REFERENCES "OrdemManutencao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
