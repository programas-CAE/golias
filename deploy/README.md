# Deploy do GOLIAS — VPS engecomengenharia.online

Estado atual (referência, não hipótese): já está no ar em
`srv1908044` (`187.127.52.83`), convivendo com outra aplicação (`gestao-frota`
/ `leitura-km`, em `/opt/gestao-frota`) sem tocar na configuração dela.

- Código em `/opt/golias` (sincronizado via `ssh`/`tar`, **não é um `git
  clone`** — este projeto não tem repositório git remoto ainda).
- `db` (Postgres) — `127.0.0.1:5433` (5432 já estava em uso pelo Postgres da
  outra aplicação — ver "Portas" abaixo).
- `server` (API) — `127.0.0.1:3333`.
- `web` (campo/fiscal) — `127.0.0.1:8080`.
- Nginx do host com vhosts próprios + HTTPS via Certbot:
  `https://api.golias.engecomengenharia.online` e
  `https://campo.golias.engecomengenharia.online`.

## Atualizar o deploy (depois de mudar código local)

Não tem `git pull` a fazer no servidor — sincroniza os arquivos direto da
máquina de desenvolvimento por SSH e reconstrói:

```bash
# rodar na raiz do repo, na máquina local (não no VPS)
tar czf - \
  --exclude=node_modules --exclude=dist --exclude=dist-electron \
  --exclude=release --exclude=.git --exclude=.env \
  --exclude='DADOS E ARQUIVOS' \
  . | ssh root@187.127.52.83 "tar xzf - -C /opt/golias"

ssh root@187.127.52.83 "cd /opt/golias && docker compose up -d --build"
```

O `--exclude=.env` preserva os `.env` que já existem no servidor (não estão
no tar local, então o `tar xzf` do lado de lá não os sobrescreve). O
container do `server` roda `prisma migrate deploy` sozinho a cada subida —
só aplica o que for novo.

Se só mudou algo em `packages/desktop` (o `.exe` do escritório), não precisa
tocar no VPS — esse pacote não é implantado lá, só `server` e `web`.

## Portas — por que 5433 e não 5432

A outra aplicação (`gestao-frota`, stack `backend-*` no `docker ps`) já
publica Postgres em `127.0.0.1:5432`, MinIO em `9000-9001` e um backend
próprio em `3000`. Antes de subir um serviço novo no host, sempre conferir:

```bash
ss -tlnp | grep -E ':<porta>'
```

`POSTGRES_PORT=5433` está fixado em `/opt/golias/.env` por causa disso — só
afeta a porta publicada no host; dentro da rede Docker o `server` continua
resolvendo o banco por `db:5432` (nome do serviço), sem relação com a porta
do host.

## Onde ficam os segredos

`/opt/golias/.env` e `/opt/golias/packages/server/.env` (permissão 600,
fora do git, gerados direto no servidor com `openssl rand -hex`). Não têm
cópia nesta máquina de desenvolvimento — se precisar recriar, gere valores
novos e reaplique (rotaciona segredos, não é problema).

`SMTP_*` está em branco — o envio de e-mail de aprovação de RDO ainda não
foi implementado no código (é só uma variável documentada para a Fase 4).
Preencher quando essa feature existir.

## Vhosts do Nginx e HTTPS

Os arquivos versionados em `deploy/nginx/*.conf.example` já refletem o que
está aplicado em `/etc/nginx/sites-available/golias-api.conf` e
`golias-web.conf` no servidor (o Certbot reescreveu esses dois arquivos lá
para adicionar os blocos `listen 443 ssl` — o `.example` no repo é a versão
"antes do Certbot"; se recriar do zero, rode `certbot --nginx -d <domínio>`
de novo depois de copiar). Certificados emitidos com contato
`admin@engecomengenharia.online` (ajustar se essa caixa não existir — não
bloqueia a renovação automática, só os avisos por e-mail).

Para recriar os vhosts do zero (servidor novo, por exemplo):

```bash
scp deploy/nginx/golias-api.conf.example root@187.127.52.83:/etc/nginx/sites-available/golias-api.conf
scp deploy/nginx/golias-web.conf.example root@187.127.52.83:/etc/nginx/sites-available/golias-web.conf
ssh root@187.127.52.83 "ln -sf /etc/nginx/sites-available/golias-api.conf /etc/nginx/sites-enabled/ && \
  ln -sf /etc/nginx/sites-available/golias-web.conf /etc/nginx/sites-enabled/ && \
  nginx -t && systemctl reload nginx && \
  certbot --nginx -d api.golias.engecomengenharia.online --non-interactive --agree-tos --redirect -m admin@engecomengenharia.online && \
  certbot --nginx -d campo.golias.engecomengenharia.online --non-interactive --agree-tos --redirect -m admin@engecomengenharia.online"
```

`nginx -t` valida a config inteira do host (a da outra aplicação incluída)
antes de recarregar — qualquer erro pré-existente nela apareceria aí, sem
relação com o GOLIAS.

## Apontar o app desktop pra produção

Nas telas de **Configurações** do app desktop (Electron), trocar a URL da
API para `https://api.golias.engecomengenharia.online`.

## Bugs corrigidos no `packages/server/Dockerfile` durante este deploy

Ambos já estão aplicados no arquivo versionado — registrado aqui só para
não se perder o motivo se alguém for mexer no Dockerfile de novo:

1. **`prisma generate` falhava no build** (`Cannot resolve environment
   variable: DATABASE_URL`) — `prisma.config.ts` exige a variável
   resolvível só para carregar a config, mesmo sem conectar no banco.
   Corrigido com um `DATABASE_URL` fictício via `ENV` na etapa de build
   (nunca usado para conectar de verdade; em runtime o `env_file` do
   Compose sobrescreve com o valor real).
2. **`@prisma/client` sem `PrismaClient` em runtime** — `pnpm deploy --prod
   --legacy` monta um `node_modules` novo para `/deploy/server` a partir do
   lockfile, sem herdar o client Prisma gerado no `node_modules` do
   workspace. Corrigido rodando `node_modules/.bin/prisma generate` de novo
   dentro de `/deploy/server`, depois do `pnpm deploy` (não usar `pnpm exec`
   aqui — dispara uma checagem de workspace que falha porque
   `/deploy/server` não tem mais o contexto do monorepo).

## Backup

**Banco** — não coberto pelo compose, rodar manualmente ou agendar via cron
do host:

```bash
docker exec golias-db pg_dump -U golias golias | gzip > golias-$(date +%F).sql.gz
```

**Anexos de RDO** (fotos, notas fiscais) — ficam no volume nomeado
`golias_uploads_data` (montado em `/app/uploads` dentro do container
`server`), não em bind mount. Sobrevive a `docker compose up --build`, mas
não a `docker compose down -v`. Backup do volume:

```bash
docker run --rm -v golias_uploads_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/golias-uploads-$(date +%F).tar.gz -C /data .
```

Agende os dois num cron do host, apontando pra um diretório fora do VPS
(ou storage externo) — perder os volumes sem backup separado perde dados de
produção.
