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

  // 静的ファイルの拡張子リスト
  const staticExtensions = ['.js', '.mjs', '.css', '.html', '.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.json', '.map'];
  
  // 静的ファイルのリクエストを優先的に処理するミドルウェア
  // APIリクエスト以外のリクエストを静的ファイルとして扱う
  app.use((req, res, next) => {
    // APIリクエストはスキップ
    if (req.path.startsWith('/api/')) {
      return next();
    }
    
    // リクエストパスを正規化（先頭のスラッシュを保持）
    const requestPath = req.path === '/' ? 'index.html' : req.path;
    
    // 静的ファイルのパスを解決（先頭のスラッシュを削除してから結合）
    const normalizedPath = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath;
    const filePath = path.resolve(distPath, normalizedPath);
    
    // パストラバーサル攻撃を防ぐため、distPath内であることを確認
    if (!filePath.startsWith(distPath)) {
      console.warn(`[Static] Invalid path attempt: ${filePath}`);
      return next();
    }
    
    // ファイル拡張子をチェック
    const ext = path.extname(filePath).toLowerCase();
    const isStaticFile = staticExtensions.includes(ext) || requestPath === 'index.html';
    
    // ファイルが存在するか確認
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        console.log(`[Static] Serving file: ${req.path} -> ${filePath}`);
        
        // MIMEタイプを設定
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
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
        } else if (filePath.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        } else if (filePath.endsWith('.map')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        
        return res.sendFile(filePath);
      }
    }
    
    // 静的ファイル拡張子のリクエストでファイルが見つからない場合は404
    if (isStaticFile) {
      console.warn(`[Static] File not found: ${req.path} (resolved: ${filePath})`);
      return res.status(404).send('File not found');
    }
    
    // 静的ファイルではない場合、次のミドルウェアに進む（SPAルートとして扱う）
    next();
  });

  // 静的ファイルを配信（MIMEタイプを正しく設定）
  // 上記のミドルウェアで処理されなかった場合のフォールバック
  app.use(express.static(distPath, {
    index: false, // index.htmlの自動提供を無効化（後で手動で処理）
    setHeaders: (res, filePath) => {
      // JavaScriptファイルのMIMEタイプを明示的に設定
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      }
    },
    // 404の場合はnext()を呼び出して次のミドルウェアに進む
    fallthrough: true,
  }));

  // SPAルート: 静的ファイルではないリクエストでindex.htmlを返す
  app.use("*", (req, res) => {
    // APIリクエストは404を返す
    if (req.path.startsWith('/api/')) {
      return res.status(404).send('API endpoint not found');
    }
    
    // 静的ファイル拡張子のリクエストも404を返す（上記のミドルウェアで処理されるべき）
    const ext = path.extname(req.path).toLowerCase();
    if (staticExtensions.includes(ext)) {
      console.warn(`[Static] Static file not found (caught by catch-all): ${req.path}`);
      return res.status(404).send('Static file not found');
    }
    
    // それ以外のリクエスト（SPAルート）でindex.htmlを返す
    const indexHtmlPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexHtmlPath)) {
      console.log(`[Static] Serving SPA route: ${req.path} -> index.html`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(indexHtmlPath);
    } else {
      console.error(`[Static] index.html not found at: ${indexHtmlPath}`);
      res.status(404).send("Not found");
    }
  });
}

