-- CreateEnum
CREATE TYPE "CategoriaBlocoHorario" AS ENUM ('ATIVIDADE', 'IMPRODUTIVA', 'INDISPONIVEL', 'ALMOCO');

-- AlterTable
ALTER TABLE "RdoBlocoHorario" ADD COLUMN     "categoria" "CategoriaBlocoHorario" NOT NULL DEFAULT 'ATIVIDADE';
