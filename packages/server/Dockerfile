# Build a self-contained, production-only copy of @golias/server (and its
# workspace dependency @golias/shared) out of the pnpm monorepo, then run it
# in a minimal image. Build from the monorepo root:
#   docker build -f packages/server/Dockerfile -t golias-server .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/desktop/package.json packages/desktop/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# prisma.config.ts exige DATABASE_URL resolvível só para carregar a config
# (mesmo "generate", que não conecta no banco, só lê o schema). O .env real
# não existe nesta etapa de build (fica de fora da imagem por segurança —
# ver .dockerignore), então um valor fictício aqui é só pra passar dessa
# checagem; em runtime o env_file do Compose sobrescreve com o valor real.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"
RUN pnpm --filter @golias/server exec prisma generate
RUN pnpm --filter @golias/server deploy --prod --legacy /deploy/server
# "pnpm deploy" monta um node_modules próprio para /deploy/server a partir
# do lockfile — não reaproveita o client Prisma gerado no passo acima (que
# ficou no node_modules do workspace, não no diretório deployado). Sem isto,
# @prisma/client fica com o pacote publicado (sem o client gerado do nosso
# schema) e o server quebra no import em runtime.
RUN cd /deploy/server && node_modules/.bin/prisma generate

FROM node:22-alpine AS production
RUN addgroup -g 1001 -S golias && adduser -S golias -u 1001
WORKDIR /app
COPY --from=build --chown=golias:golias /deploy/server ./
USER golias
ENV NODE_ENV=production
EXPOSE 3333
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/tsx src/server.ts"]
