import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initializeScheduler } from "../scheduler";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Vercel Cron Jobs用のエンドポイント
  app.get('/api/cron/schedule-check', async (req, res) => {
    // Vercel Cronからのリクエストを検証
    // CRON_SECRETが設定されている場合は認証が必要
    if (process.env.CRON_SECRET) {
      const authHeader = req.headers['authorization'];
      const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
      
      // Bearer トークンまたはクエリパラメータ/ヘッダーで認証
      const isValid = 
        authHeader === `Bearer ${process.env.CRON_SECRET}` ||
        cronSecret === process.env.CRON_SECRET;
      
      if (!isValid) {
        console.warn('[Cron] Unauthorized request to schedule-check endpoint');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    
    try {
      const { checkAndRunSchedules } = await import('../scheduler');
      const result = await checkAndRunSchedules();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('[Cron] Error executing schedule check:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Vercel環境ではnode-cronをスキップ（Cron Jobsを使用）
    if (!process.env.VERCEL) {
      // Initialize scheduler after server starts (通常のNode.js環境のみ)
      await initializeScheduler();
    } else {
      console.log('[Scheduler] Vercel environment detected, skipping node-cron initialization (using Vercel Cron Jobs)');
    }
  });
}

startServer().catch(console.error);
