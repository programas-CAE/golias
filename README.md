# GOLIAS

Sistema interno da ENGECOM para apontamento diário de obra (RDO), correção,
aprovação por e-mail do fiscal do cliente e consolidação da medição mensal
em contratos de manutenção de infraestrutura (VALE).

## Estrutura de pastas

```
packages/
  shared/    @golias/shared   — tipos, schemas (zod) e catálogo oficial de dados, compartilhados por todo o monorepo
  ui/        @golias/ui       — componentes React compartilhados (ainda vazio; entra na Fase 3)
  server/    @golias/server   — API Fastify + Prisma/PostgreSQL
  web/       @golias/web      — app público (Vite + React) para captura em campo e aprovação do fiscal
  desktop/   @golias/desktop  — app Electron de escritório (entregável desta primeira etapa)
```

Cada pacote é independente e resolvido via workspaces do pnpm
(`pnpm-workspace.yaml`), com `@golias/shared` importado diretamente pelos
demais.

## Como rodar em desenvolvimento

Pré-requisitos: Node.js 20+ e pnpm (`corepack enable pnpm` ou
`npm install -g pnpm`).

```bash
# na raiz do monorepo
pnpm install

# API (requer um Postgres rodando — ver seção "Banco de dados" abaixo)
cp packages/server/.env.example packages/server/.env
pnpm --filter @golias/server exec prisma generate
pnpm --filter @golias/server dev

# app desktop (Electron), com hot-reload do renderer
pnpm --filter @golias/desktop dev

# app web (placeholder de campo/fiscal)
pnpm --filter @golias/web dev
```

O atalho `pnpm dev` na raiz roda o app desktop.

### Banco de dados

`docker-compose.yml` na raiz sobe um Postgres 16 local:

```bash
docker compose up -d db
```

Com o banco no ar, gere as migrações iniciais (ainda não aplicadas neste
repositório, pois o ambiente em que ele foi criado não tinha um Postgres
acessível):

```bash
pnpm --filter @golias/server exec prisma migrate dev --name init
pnpm --filter @golias/server run seed
```

## Deploy em VPS

`packages/server/Dockerfile` gera uma imagem de produção autocontida (usa
`pnpm deploy` para extrair só o que `@golias/server` precisa, incluindo a
dependência de workspace `@golias/shared`), e `packages/web/Dockerfile` gera
um build estático do app público servido por Nginx. `docker compose up -d
--build` sobe os três: `db` (Postgres), `server` (API) e `web` (campo/fiscal)
— todos publicados só em `127.0.0.1` no host, nunca direto na internet.

Isso é o desenho pensado para um VPS **compartilhado com outra aplicação**:
o GOLIAS não abre portas públicas próprias, quem termina TLS e roteia por
subdomínio é o reverse proxy (Nginx) que já roda no VPS. Já está implantado
assim em produção (`engecomengenharia.online`) — estado atual, vhosts,
segredos, como atualizar (não usa `git pull`, o código vai pro servidor via
`tar`/`ssh`) e backup dos volumes estão documentados em
[`deploy/README.md`](deploy/README.md).

## Como gerar o instalador do desktop

```bash
pnpm --filter @golias/desktop run dist
```

Gera um instalador NSIS para Windows em `release/`. A primeira execução
baixa os binários do Electron e do electron-builder da internet — pode
demorar alguns minutos.

## O que já está pronto nesta primeira etapa

- Monorepo com pnpm workspaces e TypeScript estrito em todos os pacotes.
- `@golias/shared`: catálogo oficial de frentes, funções, equipamentos e
  atividades (extraído das planilhas VALE/ENGECOM), schemas zod de entrada
  de RDO e a função de cálculo de quantidade por atividade.
- `@golias/server`: schema completo do banco de dados (Prisma) cobrindo
  RDO, mão de obra, equipamentos, anexos, aprovação do fiscal, histórico e
  medição mensal; script de seed do catálogo; API Fastify com endpoint
  `GET /health`.
- `@golias/web`: esqueleto do app público com as rotas `/campo/:token` e
  `/fiscal/:token` (ainda como placeholders).
- `@golias/desktop`: app Electron completo e funcional — tela inicial com
  indicador de conexão com a API, tela de configurações (endereço do
  servidor persistido via `electron-store`), e instalador Windows (`.exe`)
  gerado via electron-builder.

## Próximas fases

1. **Dados mestres** — telas de escritório para cadastrar/editar frentes,
   equipes, colaboradores, ordens de manutenção e o catálogo de atividades.
2. **Captura de RDO em campo** — formulário completo no app web
   (`/campo/:token`), incluindo fotos e anexos, para o encarregado preencher
   pelo celular.
3. **Correção no escritório** — fluxo de revisão e correção do RDO antes do
   envio ao fiscal (usa `@golias/ui` para os componentes compartilhados).
4. **Aprovação por e-mail** — envio do RDO ao fiscal (`/fiscal/:token`),
   assinatura eletrônica simples e geração do PDF final.
5. **Medição mensal** — consolidação de `RdoAtividade` em `PeriodoMedicao`
   / `MedicaoItem` por frente/mês, com fechamento de período.

## Pendências que dependem de você

- **Configurar SMTP real** (host, porta, usuário e senha) para o envio dos
  e-mails de aprovação de RDO ao fiscal — hoje `packages/server/.env.example`
  só documenta as variáveis, sem credenciais, e o envio em si (Fase 4) ainda
  não foi implementado no código.
- **Repositório git remoto** — o projeto ainda não tem um (`git init` nunca
  rodou nesta pasta); o deploy em produção hoje sincroniza arquivos direto
  por SSH (ver [`deploy/README.md`](deploy/README.md)) em vez de `git pull`.
  Sem histórico versionado em lugar nenhum, então não há rollback fácil nem
  backup do código fora desta máquina e do servidor.

## Notas técnicas

- O ambiente de desenvolvimento usado para montar este primeiro corte não
  tinha `corepack enable pnpm` funcional (erro de permissão ao gravar em
  `C:\Program Files\nodejs`); o pnpm foi instalado via
  `npm install -g pnpm` como alternativa equivalente. Nenhuma decisão de
  arquitetura muda por causa disso — o monorepo continua usando pnpm
  workspaces normalmente.
