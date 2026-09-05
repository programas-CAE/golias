-- CreateEnum
CREATE TYPE "StatusEquipamentoDia" AS ENUM ('EM_PRODUCAO', 'AGUARDANDO', 'EM_MANUTENCAO', 'DESLOCANDO');

-- AlterTable
ALTER TABLE "RdoEquipamento" ADD COLUMN     "status" "StatusEquipamentoDia" NOT NULL DEFAULT 'EM_PRODUCAO',
ADD COLUMN     "statusObservacao" TEXT;
