-- Normaliza números de OM já gravados com espaço a mais/a menos nas pontas
-- (não deveria haver nenhum ainda, mas é seguro rodar de qualquer forma).
UPDATE "OrdemManutencao" SET "numero" = TRIM("numero") WHERE "numero" <> TRIM("numero");

-- Segunda camada de proteção contra OM duplicada: além do índice único já
-- existente em "numero" (que a validação da aplicação agora sempre recebe
-- já sem espaços), este índice garante a unicidade também por
-- TRIM("numero") para qualquer caminho de escrita que não passe pela
-- validação Zod (ex.: scripts/ferramentas administrativas futuras).
CREATE UNIQUE INDEX "OrdemManutencao_numero_trim_key" ON "OrdemManutencao" (TRIM("numero"));
