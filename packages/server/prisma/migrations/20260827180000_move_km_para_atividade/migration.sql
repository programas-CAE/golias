-- AlterTable
ALTER TABLE "RdoAtividade" ADD COLUMN     "kmInicial" DECIMAL(10,3),
ADD COLUMN     "kmFinal" DECIMAL(10,3);

-- Backfill: copia o km do local (compartilhado hoje) pra cada atividade
-- dele, antes de remover a coluna — nenhuma atividade existente fica sem
-- valor, mesmo que precise ser ajustada depois pra refletir a OM de cada
-- uma.
UPDATE "RdoAtividade" ra
SET "kmInicial" = rl."kmInicial", "kmFinal" = rl."kmFinal"
FROM "RdoLocal" rl
WHERE ra."rdoLocalId" = rl.id;

-- AlterTable
ALTER TABLE "RdoLocal" DROP COLUMN "kmInicial",
DROP COLUMN "kmFinal";
