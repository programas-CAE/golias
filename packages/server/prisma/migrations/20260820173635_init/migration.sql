-- CreateEnum
CREATE TYPE "FrenteCodigo" AS ENUM ('MAB', 'PBA', 'RAMAL');

-- CreateEnum
CREATE TYPE "RdoStatus" AS ENUM ('RASCUNHO', 'EM_CORRECAO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "UnidadeMedida" AS ENUM ('M', 'M2', 'M3', 'UND', 'HH', 'M3KM');

-- CreateEnum
CREATE TYPE "TempoClima" AS ENUM ('SOL', 'CHUVA', 'NUBLADO');

-- CreateEnum
CREATE TYPE "TipoAnexo" AS ENUM ('FOTO', 'NOTA_FISCAL', 'DOCUMENTO');

-- CreateEnum
CREATE TYPE "AprovacaoStatus" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "UsuarioRole" AS ENUM ('ADMIN', 'ESCRITORIO');

-- CreateEnum
CREATE TYPE "PeriodoMedicaoStatus" AS ENUM ('ABERTO', 'FECHADO');

-- CreateTable
CREATE TABLE "AtividadeCatalogo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" "UnidadeMedida" NOT NULL,
    "metaPus" DECIMAL(10,4),
    "usaDimensoes" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AtividadeCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuncaoCatalogo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FuncaoCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipamentoCatalogo" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EquipamentoCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Frente" (
    "id" TEXT NOT NULL,
    "codigo" "FrenteCodigo" NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Frente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "funcaoId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "frenteId" TEXT NOT NULL,
    "encarregadoId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipeMembro" (
    "id" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "funcaoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EquipeMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemManutencao" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "frenteId" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "kmInicial" DECIMAL(10,3),
    "kmFinal" DECIMAL(10,3),
    "lado" TEXT,
    "detalhes" TEXT,

    CONSTRAINT "OrdemManutencao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "role" "UsuarioRole" NOT NULL DEFAULT 'ESCRITORIO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoRefreshToken" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "criadoIp" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessaoRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rdo" (
    "id" TEXT NOT NULL,
    "frenteId" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "ordemManutencaoId" TEXT,
    "data" DATE NOT NULL,
    "horarioInicial" TEXT,
    "horarioFinal" TEXT,
    "clima" "TempoClima",
    "encarregadoId" TEXT,
    "observacoesContratada" TEXT,
    "observacoesCliente" TEXT,
    "status" "RdoStatus" NOT NULL DEFAULT 'RASCUNHO',
    "linkCampoToken" TEXT,
    "linkCampoExpiraEm" TIMESTAMP(3),
    "corrigidoPorId" TEXT,
    "corrigidoEm" TIMESTAMP(3),
    "enviadoParaFiscalEm" TIMESTAMP(3),
    "pdfPath" TEXT,
    "pdfHash" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rdo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdoLocal" (
    "id" TEXT NOT NULL,
    "rdoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "kmInicial" DECIMAL(10,3),
    "kmFinal" DECIMAL(10,3),
    "lado" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RdoLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdoAtividade" (
    "id" TEXT NOT NULL,
    "rdoLocalId" TEXT NOT NULL,
    "atividadeCatalogoId" TEXT NOT NULL,
    "altura" DECIMAL(10,3),
    "largura" DECIMAL(10,3),
    "comprimento" DECIMAL(10,3),
    "quantidadeDireta" DECIMAL(12,3),
    "totalCalculado" DECIMAL(12,3) NOT NULL,
    "unidade" "UnidadeMedida" NOT NULL,

    CONSTRAINT "RdoAtividade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdoMaoDeObra" (
    "id" TEXT NOT NULL,
    "rdoId" TEXT NOT NULL,
    "funcaoId" TEXT NOT NULL,
    "colaboradorId" TEXT,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "horasImprodutivas" DECIMAL(6,2),
    "causaImprodutividade" TEXT,

    CONSTRAINT "RdoMaoDeObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdoEquipamento" (
    "id" TEXT NOT NULL,
    "rdoId" TEXT NOT NULL,
    "equipamentoCatalogoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RdoEquipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdoAnexo" (
    "id" TEXT NOT NULL,
    "rdoId" TEXT NOT NULL,
    "tipo" "TipoAnexo" NOT NULL,
    "caminhoArquivo" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "descricao" TEXT,
    "valor" DECIMAL(12,2),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RdoAnexo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovacaoFiscal" (
    "id" TEXT NOT NULL,
    "rdoId" TEXT NOT NULL,
    "fiscalNome" TEXT NOT NULL,
    "fiscalEmail" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tokenExpiraEm" TIMESTAMP(3) NOT NULL,
    "status" "AprovacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "assinanteNome" TEXT,
    "assinadoEm" TIMESTAMP(3),
    "assinadoIp" TEXT,
    "documentoHash" TEXT,
    "comentarioReprovacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AprovacaoFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RdoHistorico" (
    "id" TEXT NOT NULL,
    "rdoId" TEXT NOT NULL,
    "deStatus" "RdoStatus",
    "paraStatus" "RdoStatus" NOT NULL,
    "ator" TEXT NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RdoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodoMedicao" (
    "id" TEXT NOT NULL,
    "frenteId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "status" "PeriodoMedicaoStatus" NOT NULL DEFAULT 'ABERTO',
    "fechadoEm" TIMESTAMP(3),

    CONSTRAINT "PeriodoMedicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicaoItem" (
    "id" TEXT NOT NULL,
    "periodoMedicaoId" TEXT NOT NULL,
    "atividadeCatalogoId" TEXT NOT NULL,
    "quantidadeTotal" DECIMAL(14,3) NOT NULL,
    "unidade" "UnidadeMedida" NOT NULL,

    CONSTRAINT "MedicaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuncaoCatalogo_nome_key" ON "FuncaoCatalogo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "EquipamentoCatalogo_nome_key" ON "EquipamentoCatalogo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Frente_codigo_key" ON "Frente"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_matricula_key" ON "Colaborador"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "EquipeMembro_equipeId_colaboradorId_key" ON "EquipeMembro"("equipeId", "colaboradorId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemManutencao_numero_key" ON "OrdemManutencao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoRefreshToken_tokenHash_key" ON "SessaoRefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Rdo_linkCampoToken_key" ON "Rdo"("linkCampoToken");

-- CreateIndex
CREATE INDEX "Rdo_frenteId_data_idx" ON "Rdo"("frenteId", "data");

-- CreateIndex
CREATE INDEX "Rdo_status_idx" ON "Rdo"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AprovacaoFiscal_token_key" ON "AprovacaoFiscal"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodoMedicao_frenteId_ano_mes_key" ON "PeriodoMedicao"("frenteId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "MedicaoItem_periodoMedicaoId_atividadeCatalogoId_key" ON "MedicaoItem"("periodoMedicaoId", "atividadeCatalogoId");

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "FuncaoCatalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "FuncaoCatalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemManutencao" ADD CONSTRAINT "OrdemManutencao_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessaoRefreshToken" ADD CONSTRAINT "SessaoRefreshToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rdo" ADD CONSTRAINT "Rdo_frenteId_fkey" FOREIGN KEY ("frenteId") REFERENCES "Frente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rdo" ADD CONSTRAINT "Rdo_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rdo" ADD CONSTRAINT "Rdo_ordemManutencaoId_fkey" FOREIGN KEY ("ordemManutencaoId") REFERENCES "OrdemManutencao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoLocal" ADD CONSTRAINT "RdoLocal_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoAtividade" ADD CONSTRAINT "RdoAtividade_rdoLocalId_fkey" FOREIGN KEY ("rdoLocalId") REFERENCES "RdoLocal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoAtividade" ADD CONSTRAINT "RdoAtividade_atividadeCatalogoId_fkey" FOREIGN KEY ("atividadeCatalogoId") REFERENCES "AtividadeCatalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoMaoDeObra" ADD CONSTRAINT "RdoMaoDeObra_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoMaoDeObra" ADD CONSTRAINT "RdoMaoDeObra_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "FuncaoCatalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoMaoDeObra" ADD CONSTRAINT "RdoMaoDeObra_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoEquipamento" ADD CONSTRAINT "RdoEquipamento_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoEquipamento" ADD CONSTRAINT "RdoEquipamento_equipamentoCatalogoId_fkey" FOREIGN KEY ("equipamentoCatalogoId") REFERENCES "EquipamentoCatalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoAnexo" ADD CONSTRAINT "RdoAnexo_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoFiscal" ADD CONSTRAINT "AprovacaoFiscal_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RdoHistorico" ADD CONSTRAINT "RdoHistorico_rdoId_fkey" FOREIGN KEY ("rdoId") REFERENCES "Rdo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicaoItem" ADD CONSTRAINT "MedicaoItem_periodoMedicaoId_fkey" FOREIGN KEY ("periodoMedicaoId") REFERENCES "PeriodoMedicao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
