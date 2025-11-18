import express from "express";
import type { Server } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic } from "./static";

type CreateAppOptions = {
  server?: Server;
};

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();

  // 全てのリクエストをログに記録（デバッグ用）
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/cron")) {
      console.log(`[App] Incoming request: ${req.method} ${req.path}`);
      console.log(`[App] Request headers:`, JSON.stringify(req.headers, null, 2));
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  // Cronエンドポイントをtrpcルートより前に配置（優先度を高くする）
  app.get("/api/cron/schedule-check", async (req, res) => {
    // Vercel Cron Jobsでキャッシュを無効化
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const startTime = Date.now();
    console.log("[Cron] Schedule check endpoint called");
    console.log("[Cron] Request headers:", JSON.stringify(req.headers, null, 2));
    console.log("[Cron] Environment:", {
      VERCEL: process.env.VERCEL,
      NODE_ENV: process.env.NODE_ENV,
      hasCRON_SECRET: !!process.env.CRON_SECRET,
    });

    // Vercel環境の場合、Vercelが自動的にAuthorizationヘッダーを追加する
    // 手動実行（開発・テスト用）の場合のみCRON_SECRETで検証
    if (process.env.CRON_SECRET && !process.env.VERCEL) {
      const authHeader = req.headers["authorization"];
      const cronSecret = req.headers["x-cron-secret"] || req.query.secret;
      const isValid =
        authHeader === `Bearer ${process.env.CRON_SECRET}` ||
        cronSecret === process.env.CRON_SECRET;

      if (!isValid) {
        console.warn("[Cron] Unauthorized request to schedule-check endpoint");
        console.warn("[Cron] Auth header:", authHeader);
        console.warn("[Cron] Cron secret:", cronSecret);
        return res.status(401).json({ error: "Unauthorized" });
      }
    }

    try {
      console.log("[Cron] Starting schedule check...");
      const { checkAndRunSchedules } = await import("../scheduler");
      const result = await checkAndRunSchedules();
      const duration = Date.now() - startTime;
      console.log(`[Cron] Schedule check completed in ${duration}ms`, result);
      res.json({ success: true, ...result, duration });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error("[Cron] Error executing schedule check:", error);
      console.error("[Cron] Error stack:", error?.stack);
      res.status(500).json({ 
        error: "Internal server error", 
        message: error?.message,
        duration 
      });
    }
  });

  if (process.env.NODE_ENV === "development" && options.server) {
    const { setupVite } = await import("./vite");
    await setupVite(app, options.server);
  } else {
    serveStatic(app);
  }

  return app;
}
