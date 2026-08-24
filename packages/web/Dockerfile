# Build um bundle estático de produção de @golias/web (Vite + React) e sirva
# via Nginx. Build a partir da raiz do monorepo:
#   docker build -f packages/web/Dockerfile \
#     --build-arg VITE_API_URL=https://api.golias.engecomengenharia.online \
#     -t golias-web .
#
# VITE_API_URL é embutida no bundle em tempo de build (padrão do Vite) — não
# pode ser trocada depois só reiniciando o container, exige rebuild da imagem.

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
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @golias/web run build

FROM nginx:1.27-alpine AS production
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/web/dist /usr/share/nginx/html
EXPOSE 80
