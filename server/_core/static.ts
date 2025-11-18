import express from "express";
import path from "path";
import fs from "fs";
import type { Express } from "express";

export function serveStatic(app: Express) {
  const isDev = process.env.NODE_ENV === "development";
  let distPath: string;
  
  if (isDev) {
    distPath = path.resolve(import.meta.dirname, "../..", "dist", "public");
  } else {
    // Vercel環境では、dist/index.jsから見てdist/publicは同じレベルにある
    // dist/index.jsの実行時、import.meta.dirnameはdist/を指すはず
    const possiblePaths = [
      path.resolve(import.meta.dirname, "public"), // dist/index.js から見て dist/public
      path.resolve(import.meta.dirname, "../dist/public"), // 別の可能性
      path.resolve(process.cwd(), "dist", "public"), // process.cwd() から
    ];
    
    // 存在するパスを探す
    distPath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
  }

  console.log(`[Static] Serving static files from: ${distPath}`);
  console.log(`[Static] Path exists: ${fs.existsSync(distPath)}`);
  console.log(`[Static] Current working directory: ${process.cwd()}`);
  console.log(`[Static] import.meta.dirname: ${import.meta.dirname}`);

  if (!fs.existsSync(distPath)) {
    console.error(
      `[Static] Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // 静的ファイルを配信（MIMEタイプを正しく設定）
  // 静的ファイルのリクエストを優先的に処理するため、すべてのリクエストより前に配置
  app.use(express.static(distPath, {
    index: false, // index.htmlの自動提供を無効化（後で手動で処理）
    setHeaders: (res, filePath) => {
      // JavaScriptファイルのMIMEタイプを明示的に設定
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      }
    },
    // 404の場合はnext()を呼び出して次のミドルウェアに進む
    fallthrough: true,
  }));

  // すべてのリクエストでindex.htmlを返す（SPA用）
  // 静的ファイルが見つからなかった場合のみここに到達
  app.use("*", (_req, res) => {
    const indexHtmlPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexHtmlPath)) {
      res.sendFile(indexHtmlPath);
    } else {
      console.error(`[Static] index.html not found at: ${indexHtmlPath}`);
      res.status(404).send("Not found");
    }
  });
}

