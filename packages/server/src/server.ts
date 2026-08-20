import "./env.js";
import { buildApp } from "./app.js";

const app = buildApp();

const port = process.env.PORT ? Number(process.env.PORT) : 3333;

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`GOLIAS server ouvindo em ${address}`);
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
