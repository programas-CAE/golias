-- AlterTable
ALTER TABLE "Rdo" ADD COLUMN     "obraId" TEXT,
ALTER COLUMN "codigoRastreio" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "Obra" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Obra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rdo_obraId_idx" ON "Rdo"("obraId");

-- AddForeignKey
ALTER TABLE "Rdo" ADD CONSTRAINT "Rdo_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
