import express from "express";
import path from "path";
import fs from "fs";
import type { Express } from "express";

export function serveStatic(app: Express) {
  const isDev = process.env.NODE_ENV === "development";
  const distRoot = isDev
    ? path.resolve(import.meta.dirname, "../..", "dist")
    : path.resolve(process.cwd(), "dist");
  const distPath = path.resolve(distRoot, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

