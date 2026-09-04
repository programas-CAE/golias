-- AlterEnum
ALTER TYPE "RdoTipo" ADD VALUE 'MOTORISTA_OPERADOR';

-- AlterTable
ALTER TABLE "Rdo" ALTER COLUMN "codigoRastreio" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "RdoEquipamento" ADD COLUMN     "combustivelLitros" DECIMAL(10,2),
ADD COLUMN     "combustivelPosto" TEXT,
ADD COLUMN     "kmFinal" DECIMAL(10,1),
ADD COLUMN     "kmInicial" DECIMAL(10,1),
ADD COLUMN     "rota" TEXT;

-- CreateTable
CREATE TABLE "ObraEtapa" (
    "id" TEXT NOT NULL,
    "obraId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dataInicioPrevista" DATE NOT NULL,
    "dataFimPrevista" DATE NOT NULL,

    CONSTRAINT "ObraEtapa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ObraEtapa_obraId_idx" ON "ObraEtapa"("obraId");

-- AddForeignKey
ALTER TABLE "ObraEtapa" ADD CONSTRAINT "ObraEtapa_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
