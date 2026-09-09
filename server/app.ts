import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";

/**
 * Build the request handler used by both the local HTTP server and Vercel.
 * This function must not call app.listen(); Vercel invokes the exported app
 * as a request-driven Serverless Function.
 */
export function createApp() {
  const app = express();

  // Vercel terminates TLS at its proxy. Trusting the first proxy lets cookie
  // configuration detect the original HTTPS request correctly.
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  return app;
}
