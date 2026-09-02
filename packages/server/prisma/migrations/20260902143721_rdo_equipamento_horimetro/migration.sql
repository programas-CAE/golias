-- AlterTable
ALTER TABLE "Rdo" ALTER COLUMN "codigoRastreio" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "RdoEquipamento" ADD COLUMN     "horimetroFinal" DECIMAL(10,2),
ADD COLUMN     "horimetroInicial" DECIMAL(10,2);

