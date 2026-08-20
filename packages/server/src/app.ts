import Fastify, { type FastifyInstance } from "fastify";
import { registerAtividadesRoutes } from "./routes/atividades.js";
import { registerColaboradoresRoutes } from "./routes/colaboradores.js";
import { registerEquipesRoutes } from "./routes/equipes.js";
import { registerFrentesRoutes } from "./routes/frentes.js";
import { registerFuncoesRoutes } from "./routes/funcoes.js";
import { registerOrdensManutencaoRoutes } from "./routes/ordensManutencao.js";

/**
 * Cria e configura a instância Fastify da API GOLIAS, sem colocá-la para
 * escutar em uma porta. Mantido separado de server.ts para permitir testes
 * de integração com `app.inject(...)` sem abrir sockets de rede.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
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

  return app;
}
