-- Novo status: encarregado assinou no celular, aguardando o escritório
-- revisar/corrigir antes de mandar pro fiscal (ver comentário no enum
-- RdoStatus em schema.prisma).
ALTER TYPE "RdoStatus" ADD VALUE 'AGUARDANDO_VALIDACAO_ESCRITORIO';
