import express from "express";
import type { Server } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

type CreateAppOptions = {
  server?: Server;
};

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  app.get("/api/cron/schedule-check", async (req, res) => {
    if (process.env.CRON_SECRET) {
      const authHeader = req.headers["authorization"];
      const cronSecret = req.headers["x-cron-secret"] || req.query.secret;
      const isValid =
        authHeader === `Bearer ${process.env.CRON_SECRET}` ||
        cronSecret === process.env.CRON_SECRET;

      if (!isValid) {
        console.warn("[Cron] Unauthorized request to schedule-check endpoint");
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    try {
      const { checkAndRunSchedules } = await import("../scheduler");
      const result = await checkAndRunSchedules();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("[Cron] Error executing schedule check:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  if (process.env.NODE_ENV === "development" && options.server) {
    await setupVite(app, options.server);
  } else {
    serveStatic(app);
  }

  return app;
}
