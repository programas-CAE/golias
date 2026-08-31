-- AlterTable (primeiro sem NOT NULL, pra poder preencher os RDOs que já existem)
ALTER TABLE "Rdo" ADD COLUMN     "codigoRastreio" TEXT;

-- Preenche os RDOs existentes: AAAAMMDD do dia em que cada um foi criado
-- ("criadoEm"), mais uma sequência de 3 dígitos por dia, na ordem de criação.
WITH numerado AS (
  SELECT
    id,
    TO_CHAR("criadoEm", 'YYYYMMDD') || LPAD(
      ROW_NUMBER() OVER (PARTITION BY TO_CHAR("criadoEm", 'YYYYMMDD') ORDER BY "criadoEm")::text,
      3,
      '0'
    ) AS codigo
  FROM "Rdo"
)
UPDATE "Rdo"
SET "codigoRastreio" = numerado.codigo
FROM numerado
WHERE "Rdo".id = numerado.id;

-- AlterTable (agora sim, obrigatório e único)
ALTER TABLE "Rdo" ALTER COLUMN "codigoRastreio" SET NOT NULL;
CREATE UNIQUE INDEX "Rdo_codigoRastreio_key" ON "Rdo"("codigoRastreio");
