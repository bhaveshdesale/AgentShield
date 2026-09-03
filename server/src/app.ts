import express from "express";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { requestLogger } from "./middleware/requestLogger";
import { apiRouter } from "./routes";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use(requestLogger);
  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
