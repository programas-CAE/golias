-- AlterTable
ALTER TABLE "Rdo" ADD COLUMN     "temperaturaMedia" DECIMAL(4,1),
ADD COLUMN     "totalDesvios" INTEGER;

-- CreateTable
CREATE TABLE "RdoMaterial" (
    "id" TEXT NOT NULL,
    "rdoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RdoMaterial_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RdoMaterial" ADD CONSTRAINT "RdoMaterial_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
