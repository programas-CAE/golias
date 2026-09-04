import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { registerAtividadesRoutes } from "./routes/atividades.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerColaboradoresRoutes } from "./routes/colaboradores.js";
import { registerContratosRoutes } from "./routes/contratos.js";
import { registerDistritosRoutes } from "./routes/distritos.js";
import { registerEncarregadoRoutes } from "./routes/encarregado.js";
import { registerEquipamentosRoutes } from "./routes/equipamentos.js";
import { registerEquipesRoutes } from "./routes/equipes.js";
import { registerFiscalRoutes } from "./routes/fiscal.js";
import { registerFrentesRoutes } from "./routes/frentes.js";
import { registerFuncoesRoutes } from "./routes/funcoes.js";
import { registerIndicadoresRoutes } from "./routes/indicadores.js";
import { registerMateriaisRoutes } from "./routes/materiais.js";
import { registerMedicoesRoutes } from "./routes/medicoes.js";
import { registerObrasRoutes } from "./routes/obras.js";
import { registerOrdensManutencaoRoutes } from "./routes/ordensManutencao.js";
import { registerPortalEncarregadoRoutes } from "./routes/portalEncarregado.js";
import { registerPortalFiscalRoutes } from "./routes/portalFiscal.js";
import { registerPowerBiRoutes } from "./routes/powerbi.js";
import { registerRdosRoutes } from "./routes/rdos.js";
import { registerRelatoriosFotograficosRoutes } from "./routes/relatoriosFotograficos.js";
import { registerUsuariosRoutes } from "./routes/usuarios.js";

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
  //
  // methods: o default do @fastify/cors é só "GET,HEAD,POST" — sem isso
  // aqui, todo PATCH/DELETE (salvar RDO em campo, editar distrito, remover
  // membro de equipe etc.) falha no preflight em qualquer navegador de
  // verdade (desktop Electron ou web), mesmo com a rota funcionando
  // perfeitamente quando chamada direto (curl, testes com app.inject).
  void app.register(cors, { origin: true, methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"] });

  // global: false — só se aplica nas rotas que explicitamente definirem
  // `config.rateLimit` (as rotas públicas /rdos/campo/:token), sem afetar
  // as rotas internas do escritório.
  void app.register(rateLimit, { global: false });
  void app.register(multipart, {
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  });

  // Sem isso, qualquer exceção não tratada numa rota (ex.: erro do Prisma
  // que escapou de um try/catch) virava o "Internal Server Error" cru do
  // Fastify na tela do usuário — sem contexto nenhum do que fazer. O erro
  // completo continua indo pro log (pra investigar depois); só a mensagem
  // que o usuário vê fica mais útil. Erros com status < 500 (validação,
  // rate limit etc.) já têm mensagem própria — só o genérico >= 500 é
  // trocado.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      return reply.status(status).send({ error: "Não foi possível concluir a operação. Tente novamente em instantes." });
    }
    return reply.status(status).send({ error: error.message });
  });

  app.get("/health", async () => {
    return { status: "ok", service: "golias-server" };
  });

  registerFrentesRoutes(app);
  registerContratosRoutes(app);
  registerDistritosRoutes(app);
  registerFuncoesRoutes(app);
  registerColaboradoresRoutes(app);
  registerOrdensManutencaoRoutes(app);
  registerRelatoriosFotograficosRoutes(app);
  registerAtividadesRoutes(app);
  registerEquipesRoutes(app);
  registerEquipamentosRoutes(app);
  registerMateriaisRoutes(app);
  registerObrasRoutes(app);
  registerRdosRoutes(app);
  registerPortalFiscalRoutes(app);
  registerPortalEncarregadoRoutes(app);
  registerFiscalRoutes(app);
  registerEncarregadoRoutes(app);
  registerAuthRoutes(app);
  registerUsuariosRoutes(app);
  registerIndicadoresRoutes(app);
  registerMedicoesRoutes(app);
  registerPowerBiRoutes(app);

  return app;
}
