-- AlterTable
ALTER TABLE "Rdo" ALTER COLUMN "codigoRastreio" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "RedefinicaoSenhaToken" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedefinicaoSenhaToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RedefinicaoSenhaToken_tokenHash_key" ON "RedefinicaoSenhaToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "RedefinicaoSenhaToken" ADD CONSTRAINT "RedefinicaoSenhaToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
