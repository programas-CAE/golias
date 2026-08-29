-- Pontos de medição adicionais de uma atividade (mesma OM/atividade, mais
-- de um trecho medido no mesmo dia) — ver comentário em
-- RdoAtividade.pontosExtras em schema.prisma.
CREATE TABLE "RdoAtividadePonto" (
    "id" TEXT NOT NULL,
    "rdoAtividadeId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "altura" DECIMAL(10,3),
    "largura" DECIMAL(10,3),
    "larguraFinal" DECIMAL(10,3),
    "comprimento" DECIMAL(10,3),
    "quantidadeDireta" DECIMAL(12,3),
    "totalCalculado" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "RdoAtividadePonto_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RdoAtividadePonto" ADD CONSTRAINT "RdoAtividadePonto_rdoAtividadeId_fkey"
    FOREIGN KEY ("rdoAtividadeId") REFERENCES "RdoAtividade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
