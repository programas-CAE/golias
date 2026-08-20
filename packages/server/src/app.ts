import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAtividadesRoutes } from "./routes/atividades.js";
import { registerColaboradoresRoutes } from "./routes/colaboradores.js";
import { registerEquipamentosRoutes } from "./routes/equipamentos.js";
import { registerEquipesRoutes } from "./routes/equipes.js";
import { registerFrentesRoutes } from "./routes/frentes.js";
import { registerFuncoesRoutes } from "./routes/funcoes.js";
import { registerOrdensManutencaoRoutes } from "./routes/ordensManutencao.js";
import { registerRdosRoutes } from "./routes/rdos.js";

/**
 * Cria e configura a instância Fastify da API GOLIAS, sem colocá-la para
 * escutar em uma porta. Mantido separado de server.ts para permitir testes
 * de integração com `app.inject(...)` sem abrir sockets de rede.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  // A API é consumida tanto pelo app desktop (Electron) quanto pelo app web
  // público (packages/web, origem diferente) — nenhum dos dois usa cookies
  // de sessão hoje, então refletir a origem da requisição é seguro.
  void app.register(cors, { origin: true });

  // global: false — só se aplica nas rotas que explicitamente definirem
  // `config.rateLimit` (as rotas públicas /rdos/campo/:token), sem afetar
  // as rotas internas do escritório.
  void app.register(rateLimit, { global: false });
  void app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  });

  app.get("/health", async () => {
    return { status: "ok", service: "golias-server" };
  });

  registerFrentesRoutes(app);
  registerFuncoesRoutes(app);
  registerColaboradoresRoutes(app);
  registerOrdensManutencaoRoutes(app);
  registerAtividadesRoutes(app);
  registerEquipesRoutes(app);
  registerEquipamentosRoutes(app);
  registerRdosRoutes(app);

  return app;
}
