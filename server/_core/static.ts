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
  
  // ディレクトリ内容をログに出力（デバッグ用）
  if (fs.existsSync(distPath)) {
    try {
      const files = fs.readdirSync(distPath);
      console.log(`[Static] Files in dist/public: ${files.slice(0, 10).join(", ")}${files.length > 10 ? "..." : ""}`);
      const assetsDir = path.resolve(distPath, "assets");
      if (fs.existsSync(assetsDir)) {
        const assetFiles = fs.readdirSync(assetsDir);
        console.log(`[Static] Asset files: ${assetFiles.slice(0, 5).join(", ")}${assetFiles.length > 5 ? "..." : ""}`);
      }
    } catch (e) {
      console.error(`[Static] Error reading directory:`, e);
    }
  }

  if (!fs.existsSync(distPath)) {
    console.error(
      `[Static] Could not find the build directory: ${distPath}, make sure to build the client first`
    );
    // パスが見つからない場合でも、とりあえずデフォルトパスを使用
    distPath = path.resolve(import.meta.dirname, "public");
  }

  // 静的ファイルのリクエストを優先的に処理するミドルウェア
  // APIリクエスト以外のリクエストを静的ファイルとして扱う
  app.use((req, res, next) => {
    // APIリクエストはスキップ
    if (req.path.startsWith('/api/')) {
      return next();
    }
    
    // 静的ファイルのリクエストを処理
    const filePath = path.join(distPath, req.path === '/' ? 'index.html' : req.path);
    
    // ファイルが存在するか確認
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      // MIMEタイプを設定
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
      } else if (filePath.endsWith('.ico')) {
        res.setHeader('Content-Type', 'image/x-icon');
      } else if (filePath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (filePath.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
      }
      
      return res.sendFile(filePath);
    }
    
    // 静的ファイルが見つからない場合、次のミドルウェアに進む
    next();
  });

  // 静的ファイルを配信（MIMEタイプを正しく設定）
  // 上記のミドルウェアで処理されなかった場合のフォールバック
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
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(indexHtmlPath);
    } else {
      console.error(`[Static] index.html not found at: ${indexHtmlPath}`);
      res.status(404).send("Not found");
    }
  });
}

