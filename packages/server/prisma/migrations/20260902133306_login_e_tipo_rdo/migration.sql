-- CreateEnum
CREATE TYPE "RdoTipo" AS ENUM ('PREVENTIVA_CORRETIVA', 'TERRAPLENAGEM', 'SUPERESTRUTURA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UsuarioRole" ADD VALUE 'FISCAL';
ALTER TYPE "UsuarioRole" ADD VALUE 'ENCARREGADO';

-- AlterTable
ALTER TABLE "Rdo" ADD COLUMN     "tipo" "RdoTipo" NOT NULL DEFAULT 'PREVENTIVA_CORRETIVA',
ALTER COLUMN "codigoRastreio" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "colaboradorId" TEXT,
ADD COLUMN     "frenteId" TEXT,
ADD COLUMN     "matriculaLogin" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RdoSuperestrutura" (
    "id" TEXT NOT NULL,
    "rdoId" TEXT NOT NULL,
    "intervaloProgramadoInicio" TEXT,
    "intervaloProgramadoFim" TEXT,
    "intervaloRealizadoInicio" TEXT,
    "intervaloRealizadoFim" TEXT,
    "tempoTotalPerdas" TEXT,

    CONSTRAINT "RdoSuperestrutura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdoSuperestruturaTemperatura" (
    "id" TEXT NOT NULL,
    "rdoSuperestruturaId" TEXT NOT NULL,
    "hora" TEXT NOT NULL,
    "temperaturaC" DECIMAL(5,2),
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "RdoSuperestruturaTemperatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdoSuperestruturaServico" (
    "id" TEXT NOT NULL,
    "rdoSuperestruturaId" TEXT NOT NULL,
    "codigo" TEXT,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT,
    "quantidade" DECIMAL(12,3),
    "linha" TEXT,
    "kmInicial" DECIMAL(10,3),
    "kmFinal" DECIMAL(10,3),
    "ordem" INTEGER NOT NULL,

    CONSTRAINT "RdoSuperestruturaServico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RdoSuperestrutura_rdoId_key" ON "RdoSuperestrutura"("rdoId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_matriculaLogin_key" ON "Usuario"("matriculaLogin");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_colaboradorId_key" ON "Usuario"("colaboradorId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoSuperestrutura" ADD CONSTRAINT "RdoSuperestrutura_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoSuperestruturaTemperatura" ADD CONSTRAINT "RdoSuperestruturaTemperatura_rdoSuperestruturaId_fkey" FOREIGN KEY ("rdoSuperestruturaId") REFERENCES "RdoSuperestrutura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoSuperestruturaServico" ADD CONSTRAINT "RdoSuperestruturaServico_rdoSuperestruturaId_fkey" FOREIGN KEY ("rdoSuperestruturaId") REFERENCES "RdoSuperestrutura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

