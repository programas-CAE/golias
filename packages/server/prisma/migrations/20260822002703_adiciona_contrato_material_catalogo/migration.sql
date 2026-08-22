-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "nome" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_numero_key" ON "Contrato"("numero");

-- Backfill: um único contrato existente hoje (todas as frentes usavam o
-- mesmo "numeroSap"), preservando o valor real já confirmado nos RDOs.
INSERT INTO "Contrato" ("id", "numero", "nome", "ativo")
SELECT DISTINCT ON ("numeroSap") gen_random_uuid()::text, "numeroSap", 'Contratação de Serviços de Manutenção de Infraestrutura da EFC - Trecho Regional 1, 2 e 3', true
FROM "Frente"
WHERE "numeroSap" IS NOT NULL;

-- AlterTable
ALTER TABLE "Frente" ADD COLUMN "contratoId" TEXT;

UPDATE "Frente" SET "contratoId" = (SELECT "id" FROM "Contrato" LIMIT 1);

ALTER TABLE "Frente" ALTER COLUMN "contratoId" SET NOT NULL;
ALTER TABLE "Frente" DROP COLUMN "numeroSap";

-- AddForeignKey
ALTER TABLE "Frente" ADD CONSTRAINT "Frente_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "MaterialCatalogo" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "precoUnitario" DECIMAL(14,4),
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MaterialCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCatalogo_contratoId_codigo_key" ON "MaterialCatalogo"("contratoId", "codigo");

-- AddForeignKey
ALTER TABLE "MaterialCatalogo" ADD CONSTRAINT "MaterialCatalogo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: RdoMaterial passa a referenciar o catálogo em vez de texto
-- livre. Não há linhas hoje (0 registros), então troca direto sem backfill.
ALTER TABLE "RdoMaterial" DROP COLUMN "nome",
DROP COLUMN "unidade",
ADD COLUMN "materialCatalogoId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "RdoMaterial" ADD CONSTRAINT "RdoMaterial_materialCatalogoId_fkey" FOREIGN KEY ("materialCatalogoId") REFERENCES "MaterialCatalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
