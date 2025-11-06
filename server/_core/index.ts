import "dotenv/config";
import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type ServerResponse,
} from "http";
import net from "net";
import type { Express } from "express";
import { createApp } from "./app";
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
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  const server = createServer();
  const app = await createApp({ server });

  server.on("request", app as unknown as RequestListener);

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);
    if (!process.env.VERCEL) {
      await initializeScheduler();
    } else {
      console.log(
        "[Scheduler] Vercel environment detected, skipping node-cron initialization (using Vercel Cron Jobs)"
      );
    }
  });
}

let appPromise: Promise<Express> | null = null;

if (!process.env.VERCEL) {
  startServer().catch(console.error);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!appPromise) {
    appPromise = createApp();
  }
  const app = await appPromise;
  const requestListener = app as unknown as RequestListener;
  return requestListener(req, res);
}
