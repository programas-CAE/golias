/*
  Warnings:

  - You are about to drop the column `frenteId` on the `Equipe` table. All the data in the column will be lost.
  - Added the required column `distritoId` to the `Equipe` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Equipe" DROP CONSTRAINT "Equipe_frenteId_fkey";

-- AlterTable
ALTER TABLE "Equipe" DROP COLUMN "frenteId",
ADD COLUMN     "distritoId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Distrito" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "frenteId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Distrito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Distrito_frenteId_nome_key" ON "Distrito"("frenteId", "nome");

-- AddForeignKey
ALTER TABLE "Distrito" ADD CONSTRAINT "Distrito_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_distritoId_fkey" FOREIGN KEY ("distritoId") REFERENCES "Distrito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
