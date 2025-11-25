import puppeteer from "puppeteer";
import { install, detectBrowserPlatform, resolveBuildId, computeExecutablePath, Browser } from "@puppeteer/browsers";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { storagePut, storageGet, storageDelete, extractStorageKeyFromUrl } from "./storage";
import * as db from "./db";
import { sendNotifications } from "./notification";
import crypto from "crypto";
import { compressImageToJpeg, convertKeyToJpeg } from "./imageCompression";
import path from "path";
import fs from "fs";
import os from "os";

// Chromeインストールのキャッシュ（一度だけインストールする）
let chromeInstallPromise: Promise<string | undefined> | null = null;

// Vercel環境でのPuppeteerキャッシュパスを設定（一度だけ実行）
// モジュール読み込み時に設定することで、Puppeteerが内部的に参照する前に設定される
if (process.env.VERCEL) {
  if (!process.env.PUPPETEER_CACHE_DIR) {
    // Vercel環境では/tmpディレクトリを使用
    process.env.PUPPETEER_CACHE_DIR = "/tmp/puppeteer";
    console.log("[Puppeteer] Set PUPPETEER_CACHE_DIR to /tmp/puppeteer for Vercel environment");
  } else {
    console.log(`[Puppeteer] PUPPETEER_CACHE_DIR already set to: ${process.env.PUPPETEER_CACHE_DIR}`);
  }
  
  // さらに、Puppeteerが使用する可能性のある他の環境変数も設定
  if (!process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) {
    // Chromeを自動ダウンロードしないように設定（@puppeteer/browsersで管理）
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
  }
}

/**
 * Check if Chrome is already installed
 */
function checkExistingChrome(cacheDir: string, platform: any): string | undefined {
  try {
    console.log(`[Puppeteer] Checking for existing Chrome in: ${cacheDir}`);
    
    // 既存のChromeバージョンを探す（最新のものから順に）
    const cachePath = path.join(cacheDir, "chrome");
    
    if (!fs.existsSync(cacheDir)) {
      console.log(`[Puppeteer] Cache directory does not exist: ${cacheDir}`);
      return undefined;
    }
    
    if (!fs.existsSync(cachePath)) {
      console.log(`[Puppeteer] Chrome cache path does not exist: ${cachePath}`);
      return undefined;
    }
    
    const dirs = fs.readdirSync(cachePath);
    console.log(`[Puppeteer] Found ${dirs.length} items in Chrome cache directory`);
    
    const versions = dirs.filter(dir => {
      const versionPath = path.join(cachePath, dir);
      try {
        return fs.statSync(versionPath).isDirectory();
      } catch (error) {
        return false;
      }
    }).sort().reverse(); // 最新のバージョンから
    
    console.log(`[Puppeteer] Found ${versions.length} Chrome version(s): ${versions.join(", ")}`);
    
    for (const version of versions) {
      const executablePath = computeExecutablePath({
        browser: Browser.CHROMIUM,
        buildId: version,
        cacheDir,
        platform,
      });
      
      console.log(`[Puppeteer] Checking Chrome ${version} at: ${executablePath}`);
      
      if (fs.existsSync(executablePath)) {
        console.log(`[Puppeteer] ✓ Found existing Chrome ${version} at: ${executablePath}`);
        return executablePath;
      } else {
        console.log(`[Puppeteer] ✗ Chrome executable not found at: ${executablePath}`);
      }
    }
    
    console.log(`[Puppeteer] No existing Chrome found in cache directory`);
  } catch (error: any) {
    console.warn(`[Puppeteer] Error checking existing Chrome: ${error.message}`);
    console.warn(`[Puppeteer] Stack trace:`, error.stack);
  }
  return undefined;
}

/**
 * Install Chrome using @puppeteer/browsers if not found
 */
async function installChromeIfNeeded(): Promise<string | undefined> {
  try {
    const platform = detectBrowserPlatform();
    if (!platform) {
      console.warn("[Puppeteer] Could not detect browser platform");
      return undefined;
    }

    // キャッシュディレクトリを取得（環境変数またはデフォルト）
    // Vercel環境では/tmpディレクトリを使用（書き込み可能）
    let cacheDir = process.env.PUPPETEER_CACHE_DIR;
    if (!cacheDir) {
      if (process.env.VERCEL) {
        // Vercel環境では/tmpディレクトリを使用
        cacheDir = "/tmp/puppeteer";
      } else {
        // その他の環境では環境変数またはデフォルトパスを使用
        cacheDir = process.env.XDG_CACHE_HOME || 
                   path.join(os.homedir(), ".cache", "puppeteer");
      }
    }
    
    // キャッシュディレクトリが存在しない場合は作成
    if (!fs.existsSync(cacheDir)) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch (error: any) {
        console.warn(`[Puppeteer] Failed to create cache directory ${cacheDir}: ${error.message}`);
        // フォールバック: /tmpを使用
        if (cacheDir !== "/tmp/puppeteer") {
          cacheDir = "/tmp/puppeteer";
          if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
          }
        }
      }
    }

    // 既存のChromeをチェック（インストール済みの場合は再利用）
    const existingChrome = checkExistingChrome(cacheDir, platform);
    if (existingChrome) {
      console.log(`[Puppeteer] Using existing Chrome: ${existingChrome}`);
      return existingChrome;
    }

    // Chromeの最新ビルドIDを取得
    console.log("[Puppeteer] Resolving Chrome build ID...");
    const buildId = await resolveBuildId(Browser.CHROMIUM, platform, "latest");
    if (!buildId) {
      console.warn("[Puppeteer] Could not resolve Chrome build ID");
      return undefined;
    }
    console.log(`[Puppeteer] Resolved Chrome build ID: ${buildId}`);

    // インストール処理にタイムアウトを設定（Vercel環境では120秒、その他は180秒）
    const timeout = process.env.VERCEL ? 120000 : 180000;
    const installStartTime = Date.now();
    
    console.log(`[Puppeteer] Installing Chrome ${buildId} to ${cacheDir}... (timeout: ${timeout/1000}s)`);
    
    // 進捗ログ用のタイマー（30秒ごとにログを出力）
    const progressInterval = setInterval(() => {
      const elapsed = ((Date.now() - installStartTime) / 1000).toFixed(1);
      console.log(`[Puppeteer] Chrome installation in progress... (elapsed: ${elapsed}s)`);
    }, 30000);
    
    // タイムアウト付きでインストール
    const installPromise = install({
      browser: Browser.CHROMIUM,
      buildId,
      cacheDir,
      platform,
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Chrome installation timeout after ${timeout/1000} seconds`));
      }, timeout);
    });
    
    try {
      await Promise.race([installPromise, timeoutPromise]);
      clearInterval(progressInterval);
      
      const installDuration = ((Date.now() - installStartTime) / 1000).toFixed(1);
      console.log(`[Puppeteer] Chrome installation completed in ${installDuration}s`);
    } catch (installError: any) {
      clearInterval(progressInterval);
      const elapsedTime = ((Date.now() - installStartTime) / 1000).toFixed(1);
      
      if (installError.message?.includes("timeout")) {
        console.error(`[Puppeteer] Chrome installation timed out after ${elapsedTime}s`);
        console.error(`[Puppeteer] Timeout limit: ${timeout/1000}s`);
        console.error(`[Puppeteer] This may be due to slow network or large Chrome version (142+).`);
        console.error(`[Puppeteer] Cache directory: ${cacheDir}`);
        console.error(`[Puppeteer] Platform: ${platform}`);
        console.error(`[Puppeteer] Build ID: ${buildId}`);
        
        // キャッシュディレクトリの状態を確認
        try {
          if (fs.existsSync(cacheDir)) {
            const files = fs.readdirSync(cacheDir);
            console.error(`[Puppeteer] Cache directory contents: ${files.join(", ")}`);
          } else {
            console.error(`[Puppeteer] Cache directory does not exist: ${cacheDir}`);
          }
        } catch (dirError: any) {
          console.error(`[Puppeteer] Failed to check cache directory: ${dirError.message}`);
        }
        
        throw installError;
      } else {
        console.error(`[Puppeteer] Chrome installation failed after ${elapsedTime}s:`, installError.message);
        console.error(`[Puppeteer] Error stack:`, installError.stack);
        throw installError;
      }
    }

    // インストールされたChromeの実行パスを取得
    const executablePath = computeExecutablePath({
      browser: Browser.CHROMIUM,
      buildId,
      cacheDir,
      platform,
    });

    console.log(`[Puppeteer] Checking installed Chrome at: ${executablePath}`);
    
    if (fs.existsSync(executablePath)) {
      const stats = fs.statSync(executablePath);
      console.log(`[Puppeteer] Chrome installed successfully: ${executablePath}`);
      console.log(`[Puppeteer] Chrome file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      return executablePath;
    } else {
      console.warn(`[Puppeteer] Chrome executable not found at: ${executablePath}`);
      console.warn(`[Puppeteer] Cache directory: ${cacheDir}`);
      console.warn(`[Puppeteer] Build ID: ${buildId}`);
      console.warn(`[Puppeteer] Platform: ${platform}`);
      
      // キャッシュディレクトリの内容を確認
      try {
        if (fs.existsSync(cacheDir)) {
          const files = fs.readdirSync(cacheDir);
          console.warn(`[Puppeteer] Cache directory contents: ${files.join(", ")}`);
          
          const chromePath = path.join(cacheDir, "chrome");
          if (fs.existsSync(chromePath)) {
            const chromeDirs = fs.readdirSync(chromePath);
            console.warn(`[Puppeteer] Chrome directory contents: ${chromeDirs.join(", ")}`);
          }
        }
      } catch (dirError: any) {
        console.warn(`[Puppeteer] Failed to check cache directory: ${dirError.message}`);
      }
      
      return undefined;
    }
  } catch (error: any) {
    console.error("[Puppeteer] Failed to install Chrome:", error.message);
    console.error("[Puppeteer] Error type:", error.constructor.name);
    console.error("[Puppeteer] Error stack:", error.stack);
    return undefined;
  }
}

/**
 * Get Chrome executable path, with timeout and fallback
 */
async function getChromeExecutablePath(): Promise<string | undefined> {
  console.log("[Puppeteer] getChromeExecutablePath() called");
  
  // 環境変数でChromeパスが指定されている場合はそれを使用
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (fs.existsSync(envPath)) {
      console.log(`[Puppeteer] Using Chrome from PUPPETEER_EXECUTABLE_PATH: ${envPath}`);
      return envPath;
    }
  }
  
  // Vercel環境では、まずシステムChromeを探す（Puppeteerのデフォルトパスは存在しないことが多い）
  if (process.env.VERCEL) {
    const systemPaths = [
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/chrome",
      "/usr/bin/google-chrome-stable",
      "/opt/google/chrome/chrome",
    ];
    
    for (const chromePath of systemPaths) {
      try {
        if (fs.existsSync(chromePath)) {
          console.log(`[Puppeteer] Using system Chrome: ${chromePath}`);
          return chromePath;
        }
      } catch (error) {
        // ファイルアクセスエラーの場合は次のパスを試す
        continue;
      }
    }
    
  // Vercel環境では、puppeteer.executablePath()を呼ばずに、直接インストールを試みる
  // （puppeteer.executablePath()は書き込み不可能なデフォルトパスを参照するため）
  console.log("[Puppeteer] Vercel environment detected, checking for existing Chrome or installing...");
  
  // まず既存のChromeをチェック（インストール済みの場合は再利用）
  const platform = detectBrowserPlatform();
  if (platform) {
    const cacheDir = process.env.PUPPETEER_CACHE_DIR || "/tmp/puppeteer";
    const existingChrome = checkExistingChrome(cacheDir, platform);
    if (existingChrome) {
      console.log(`[Puppeteer] Using existing Chrome in Vercel: ${existingChrome}`);
      return existingChrome;
    }
  }
  
  // 既存のChromeが見つからない場合、インストールを試みる
  console.log("[Puppeteer] No existing Chrome found, attempting installation...");
  
  // インストール処理は一度だけ実行されるようにキャッシュ
  if (!chromeInstallPromise) {
    chromeInstallPromise = installChromeIfNeeded();
  }
  
  const installedPath = await chromeInstallPromise;
  if (installedPath) {
    return installedPath;
  }
  
  // インストールも失敗した場合はundefinedを返す
  console.warn("[Puppeteer] Chrome installation failed in Vercel environment");
  return undefined;
  }
  
  // 非Vercel環境では、Puppeteerのデフォルト実行パスを試す
  try {
    const defaultPath = await puppeteer.executablePath();
    if (defaultPath) {
      // パスが存在するか必ずチェック
      if (fs.existsSync(defaultPath)) {
        console.log(`[Puppeteer] Using default Chrome path: ${defaultPath}`);
        return defaultPath;
      } else {
        console.warn(`[Puppeteer] Default path does not exist: ${defaultPath}`);
      }
    }
  } catch (error) {
    console.warn("[Puppeteer] Could not get default executable path:", error);
  }
  
  // Chromeが見つからない場合、インストールを試みる
  console.log("[Puppeteer] Chrome not found, attempting to install...");
  
  // インストール処理は一度だけ実行されるようにキャッシュ
  if (!chromeInstallPromise) {
    chromeInstallPromise = installChromeIfNeeded();
  }
  
  const installedPath = await chromeInstallPromise;
  if (installedPath) {
    return installedPath;
  }
  
  // インストールも失敗した場合はundefinedを返す（Puppeteerに自動検出を任せる）
  console.warn("[Puppeteer] Chrome installation failed, letting Puppeteer use default behavior");
  return undefined;
}

/**
 * Get or create user data directory for Chrome profile
 * Vercel環境では/tmpディレクトリを使用し、既存のプロファイルを再利用
 */
function getUserDataDir(): string {
  if (process.env.VERCEL) {
    // Vercel環境では固定のプロファイルディレクトリを使用（再利用）
    const userDataDir = "/tmp/puppeteer_profile";
    
    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(userDataDir)) {
      try {
        fs.mkdirSync(userDataDir, { recursive: true });
      } catch (error: any) {
        console.warn(`[Puppeteer] Failed to create userDataDir ${userDataDir}: ${error.message}`);
        // フォールバック: ランダムなディレクトリ名を使用
        return path.join("/tmp", `puppeteer_profile_${Date.now()}`);
      }
    }
    
    return userDataDir;
  } else {
    // その他の環境では環境変数またはデフォルトパスを使用
    return process.env.PUPPETEER_USER_DATA_DIR || 
           path.join(os.tmpdir(), "puppeteer_profile");
  }
}

/**
 * Clean up old temporary files in /tmp to free up space
 */
function cleanupTempFiles() {
  if (!process.env.VERCEL) {
    return; // Vercel環境でのみ実行
  }
  
  try {
    const tmpDir = "/tmp";
    const files = fs.readdirSync(tmpDir);
    const now = Date.now();
    const maxAge = 3600000; // 1時間前のファイルを削除
    
    for (const file of files) {
      // puppeteer関連の一時ファイルのみをクリーンアップ
      if (file.startsWith("puppeteer") || file.startsWith("chrome")) {
        const filePath = path.join(tmpDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > maxAge) {
            if (stats.isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
            console.log(`[Puppeteer] Cleaned up old temp file: ${filePath}`);
          }
        } catch (error: any) {
          // ファイル削除エラーは無視（他のプロセスが使用中など）
          console.warn(`[Puppeteer] Failed to clean up ${filePath}: ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    console.warn(`[Puppeteer] Failed to cleanup temp files: ${error.message}`);
  }
}

/**
 * Launch browser with proper Chrome path (with timeout and better error handling)
 */
async function launchBrowser() {
  console.log("[Puppeteer] Launching browser...");
  let executablePath: string | undefined;
  
  // Vercel環境では古い一時ファイルをクリーンアップ
  if (process.env.VERCEL) {
    console.log("[Puppeteer] Vercel environment detected, cleaning up temp files...");
    cleanupTempFiles();
  }
  
  // タイムアウト付きでChromeパスを取得（Vercel環境では120秒、その他は180秒）
  // Chrome 142のインストールには時間がかかるため、タイムアウトを延長
  console.log("[Puppeteer] Getting Chrome executable path...");
  try {
    const timeout = process.env.VERCEL ? 120000 : 180000;
    const timeoutPromise = new Promise<undefined>((resolve) => {
      setTimeout(() => {
        console.warn(`[Puppeteer] Chrome path resolution timeout after ${timeout/1000}s`);
        resolve(undefined);
      }, timeout);
    });
    
    executablePath = await Promise.race([
      getChromeExecutablePath(),
      timeoutPromise,
    ]);
    
    if (executablePath) {
      console.log(`[Puppeteer] Chrome executable path obtained: ${executablePath}`);
    } else {
      console.warn("[Puppeteer] Chrome executable path not obtained (timeout or error)");
    }
  } catch (error: any) {
    console.warn(`[Puppeteer] Error getting Chrome path: ${error.message}`);
  }
  
  // Vercel環境では、executablePathが取得できなかった場合でもインストールを試みる
  if (process.env.VERCEL && !executablePath) {
    console.log("[Puppeteer] Vercel environment: executablePath not found, attempting installation...");
    if (!chromeInstallPromise) {
      console.log("[Puppeteer] Starting Chrome installation...");
      chromeInstallPromise = installChromeIfNeeded();
    } else {
      console.log("[Puppeteer] Chrome installation already in progress, waiting...");
    }
    executablePath = await chromeInstallPromise;
    if (executablePath) {
      console.log(`[Puppeteer] Chrome installation completed: ${executablePath}`);
    } else {
      console.error("[Puppeteer] Chrome installation failed or returned undefined");
    }
  }
  
  // Vercel環境では、executablePathが必須
  if (process.env.VERCEL && !executablePath) {
    throw new Error(
      "Vercel環境でChromeのパスを取得できませんでした。" +
      "\nインストール処理が失敗した可能性があります。" +
      "\nログを確認してください。"
    );
  }
  
  // ユーザーデータディレクトリを取得
  const userDataDir = getUserDataDir();
  
  // launchオプションを構築
  const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    userDataDir, // プロファイルディレクトリを明示的に指定
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--single-process", // Vercel環境でのメモリ制約に対応
      "--disable-background-networking", // バックグラウンドネットワークを無効化して容量を節約
      "--disable-sync", // 同期を無効化
      "--disable-default-apps", // デフォルトアプリを無効化
      "--disable-translate", // 翻訳機能を無効化
    ],
  };
  
  // executablePathを必ず設定（Vercel環境では必須）
  if (executablePath) {
    launchOptions.executablePath = executablePath;
    console.log(`[Puppeteer] Using Chrome executable: ${executablePath}`);
  } else if (!process.env.VERCEL) {
    // 非Vercel環境では、executablePathが未指定でもPuppeteerに自動検出を任せる
    console.log("[Puppeteer] No explicit executablePath, letting Puppeteer auto-detect");
  }
  
  // デバッグ情報をログに出力
  if (process.env.VERCEL) {
    console.log(`[Puppeteer] Launch options:`, {
      executablePath: executablePath || "not set",
      userDataDir,
      PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || "not set",
      hasExecutablePath: !!executablePath,
    });
  }
  
  try {
    return await puppeteer.launch(launchOptions);
  } catch (error: any) {
    // エラーの詳細をログに出力
    console.error(`[Puppeteer] Launch failed:`, {
      error: error.message,
      executablePath: executablePath || "not set",
      userDataDir,
      PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR || "not set",
      VERCEL: process.env.VERCEL,
    });
    
    // ENOSPCエラーの場合、プロファイルディレクトリをクリーンアップして再試行
    if (error.message?.includes("ENOSPC") || error.message?.includes("no space left")) {
      console.warn(`[Puppeteer] Disk space error, cleaning up profile directory: ${error.message}`);
      try {
        if (fs.existsSync(userDataDir)) {
          fs.rmSync(userDataDir, { recursive: true, force: true });
          fs.mkdirSync(userDataDir, { recursive: true });
        }
        // クリーンアップ後に再試行
        return await puppeteer.launch(launchOptions);
      } catch (cleanupError: any) {
        console.error(`[Puppeteer] Failed to cleanup and retry: ${cleanupError.message}`);
        throw new Error(
          `ディスク容量不足のためChrome起動に失敗しました。` +
          `\nエラー: ${error.message}` +
          `\nヒント: /tmpディレクトリの容量を確認してください。`
        );
      }
    }
    
    // Vercel環境でChromeが見つからないエラーの場合、再インストールを試みる
    if (process.env.VERCEL && error.message?.includes("Could not find Chrome")) {
      console.warn(`[Puppeteer] Chrome not found in Vercel, attempting re-installation: ${error.message}`);
      
      // インストールプロミスをリセット
      chromeInstallPromise = null;
      
      // 再インストールを試みる
      try {
        const reinstalledPath = await installChromeIfNeeded();
        if (reinstalledPath && fs.existsSync(reinstalledPath)) {
          console.log(`[Puppeteer] Chrome re-installed successfully: ${reinstalledPath}`);
          launchOptions.executablePath = reinstalledPath;
          return await puppeteer.launch(launchOptions);
        }
      } catch (reinstallError: any) {
        console.error(`[Puppeteer] Re-installation failed: ${reinstallError.message}`);
      }
    }
    
    // executablePathを指定した場合に失敗したら、executablePathなしで再試行（非Vercel環境のみ）
    if (executablePath && error.message?.includes("Could not find Chrome") && !process.env.VERCEL) {
      console.warn(`[Puppeteer] Failed with explicit path, retrying without executablePath: ${error.message}`);
      delete launchOptions.executablePath;
      try {
        return await puppeteer.launch(launchOptions);
      } catch (retryError: any) {
        // 再試行も失敗した場合、より詳細なエラーメッセージを提供
        throw new Error(
          `Chrome起動に失敗しました。` +
          `\n明示的なパス: ${executablePath}` +
          `\nエラー: ${retryError.message}` +
          `\nヒント: PUPPETEER_EXECUTABLE_PATH環境変数を設定するか、` +
          `\nChromeが正しくインストールされているか確認してください。`
        );
      }
    }
    throw error;
  }
}

/**
 * Take a screenshot of a URL and return the buffer
 */
export async function captureScreenshot(url: string): Promise<Buffer> {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (error: any) {
    // Chrome起動エラーの場合、より詳細なエラーメッセージを提供
    if (error.message?.includes("Could not find Chrome") || error.message?.includes("Chrome起動に失敗")) {
      throw new Error(
        `スクリーンショット撮影に失敗しました: Chromeが見つかりません。` +
        `\n${error.message}` +
        `\n\n解決方法:` +
        `\n1. PUPPETEER_EXECUTABLE_PATH環境変数にChromeのパスを設定` +
        `\n2. または、@puppeteer/browsersがChromeを自動インストールできるように権限を確認`
      );
    }
    throw error;
  }

  try {
    const page = await browser.newPage();
    // より大きなビューポートでスクロールを確実に捉える
    await page.setViewport({ width: 1280, height: 800 });
    
    // Set longer timeout and use domcontentloaded instead of networkidle0
    await page.goto(url, { 
      waitUntil: "domcontentloaded", 
      timeout: 60000 
    });
    
    // Wait for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ページの実際の高さを取得して、スクロールを確実に行う
    const pageHeight = await page.evaluate(() => {
      return Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
    });
    
    // ページの高さが大きい場合、スクロールして全体を読み込む
    if (pageHeight > 800) {
      // 段階的にスクロールして、遅延読み込みコンテンツを確実に読み込む
      const viewportHeight = 800;
      const scrollSteps = Math.ceil(pageHeight / viewportHeight);
      
      for (let i = 0; i < scrollSteps; i++) {
        await page.evaluate((step) => {
          window.scrollTo(0, step * 800);
        }, i);
        // 各スクロール後に少し待機
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 最後に一番下までスクロール
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // トップに戻る（fullPage screenshotは最初から最後まで撮影するため）
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // fullPageオプションで全体を撮影（余白を確保）
    const screenshot = await page.screenshot({ 
      fullPage: true,
      // スクロールバーを非表示にする（オプション）
      captureBeyondViewport: true,
    });
    return screenshot as Buffer;
  } catch (error: any) {
    // スクリーンショット撮影中のエラーを詳細に記録
    console.error(`[Puppeteer] Screenshot capture failed for ${url}:`, error.message);
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn("[Puppeteer] Error closing browser:", closeError);
      }
    }
  }
}

/**
 * Check if a URL is accessible (not broken)
 * Vercel環境ではfetch APIを使用して軽量にチェック
 */
export async function checkLinkStatus(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  // Vercel環境ではfetch APIを使用（Chrome不要、高速）
  if (process.env.VERCEL) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒タイムアウト
      
      const response = await fetch(url, {
        method: "HEAD", // HEADリクエストで軽量にチェック
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MonitraBot/1.0; +https://monitra.magitech-tool-lab.com)",
        },
      });
      
      clearTimeout(timeoutId);
      const status = response.status;
      return { ok: status >= 200 && status < 400, status };
    } catch (error: any) {
      // HEADが失敗した場合、GETで再試行
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; MonitraBot/1.0; +https://monitra.magitech-tool-lab.com)",
          },
        });
        
        clearTimeout(timeoutId);
        const status = response.status;
        return { ok: status >= 200 && status < 400, status };
      } catch (retryError: any) {
        return { 
          ok: false, 
          error: retryError.name === "AbortError" 
            ? "Request timeout" 
            : retryError.message || String(retryError)
        };
      }
    }
  }
  
  // 非Vercel環境ではPuppeteerを使用（JavaScriptでリダイレクトするページもチェック可能）
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    const response = await page.goto(url, { 
      waitUntil: "domcontentloaded", 
      timeout: 60000 
    });
    
    if (!response) {
      return { ok: false, error: "No response received" };
    }
    
    const status = response.status();
    return { ok: status >= 200 && status < 400, status };
  } catch (error: any) {
    return { ok: false, error: error.message };
  } finally {
    await browser.close();
  }
}

/**
 * Compare two screenshots and return difference percentage
 */
export async function compareScreenshots(
  img1Buffer: Buffer,
  img2Buffer: Buffer
): Promise<{ diffPercentage: number; diffImageBuffer?: Buffer }> {
  const img1 = PNG.sync.read(img1Buffer);
  const img2 = PNG.sync.read(img2Buffer);

  const { width, height } = img1;
  
  // If dimensions don't match, resize or return high difference
  if (img2.width !== width || img2.height !== height) {
    return { diffPercentage: 100 };
  }

  const diff = new PNG({ width, height });
  const numDiffPixels = pixelmatch(
    img1.data,
    img2.data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );

  const diffPercentage = (numDiffPixels / (width * height)) * 100;
  const diffImageBuffer = PNG.sync.write(diff);

  return { diffPercentage, diffImageBuffer };
}

/**
 * Compare screenshots by first view and body
 * Returns detailed analysis of which parts changed
 */
export async function compareScreenshotsByFirstViewAndBody(
  img1Buffer: Buffer,
  img2Buffer: Buffer
): Promise<{
  overall: number;
  firstView: number;
  body: number;
  diffImageBuffer?: Buffer;
  analysis: string;
}> {
  const img1 = PNG.sync.read(img1Buffer);
  const img2 = PNG.sync.read(img2Buffer);

  let width = img1.width;
  let height = img1.height;
  let img2Data = img2.data;
  
  // If dimensions don't match, resize img2 to match img1
  if (img2.width !== width || img2.height !== height) {
    // Use the smaller dimensions to avoid upscaling
    const targetWidth = Math.min(img1.width, img2.width);
    const targetHeight = Math.max(img1.height, img2.height);
    
    // Resize both images to the target dimensions using simple scaling
    // For now, we'll use the larger height to ensure we compare the full page
    width = targetWidth;
    height = targetHeight;
    
    // Create new PNG with target dimensions
    const resizedImg1 = new PNG({ width, height });
    const resizedImg2 = new PNG({ width, height });
    
    // Simple nearest-neighbor scaling for img1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcY = Math.floor(y * img1.height / height);
        const srcX = Math.floor(x * img1.width / width);
        const srcIdx = (img1.width * srcY + srcX) << 2;
        const dstIdx = (width * y + x) << 2;
        
        if (srcY < img1.height && srcX < img1.width) {
          resizedImg1.data[dstIdx] = img1.data[srcIdx];
          resizedImg1.data[dstIdx + 1] = img1.data[srcIdx + 1];
          resizedImg1.data[dstIdx + 2] = img1.data[srcIdx + 2];
          resizedImg1.data[dstIdx + 3] = img1.data[srcIdx + 3];
        } else {
          // Fill with white if out of bounds
          resizedImg1.data[dstIdx] = 255;
          resizedImg1.data[dstIdx + 1] = 255;
          resizedImg1.data[dstIdx + 2] = 255;
          resizedImg1.data[dstIdx + 3] = 255;
        }
      }
    }
    
    // Simple nearest-neighbor scaling for img2
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcY = Math.floor(y * img2.height / height);
        const srcX = Math.floor(x * img2.width / width);
        const srcIdx = (img2.width * srcY + srcX) << 2;
        const dstIdx = (width * y + x) << 2;
        
        if (srcY < img2.height && srcX < img2.width) {
          resizedImg2.data[dstIdx] = img2.data[srcIdx];
          resizedImg2.data[dstIdx + 1] = img2.data[srcIdx + 1];
          resizedImg2.data[dstIdx + 2] = img2.data[srcIdx + 2];
          resizedImg2.data[dstIdx + 3] = img2.data[srcIdx + 3];
        } else {
          // Fill with white if out of bounds
          resizedImg2.data[dstIdx] = 255;
          resizedImg2.data[dstIdx + 1] = 255;
          resizedImg2.data[dstIdx + 2] = 255;
          resizedImg2.data[dstIdx + 3] = 255;
        }
      }
    }
    
    // Use resized images for comparison
    img1.width = width;
    img1.height = height;
    img1.data = resizedImg1.data;
    img2.width = width;
    img2.height = height;
    img2Data = resizedImg2.data;
  }

  // Calculate overall difference
  const diff = new PNG({ width, height });
  const numDiffPixels = pixelmatch(
    img1.data,
    img2Data,
    diff.data,
    width,
    height,
    { threshold: 0.1 }
  );
  const overall = (numDiffPixels / (width * height)) * 100;

  // Divide into first view and body
  // First view: 800px (PCモニターの一般的なファーストビュー高さ)
  const FIRSTVIEW_HEIGHT = 800;
  const firstViewHeight = Math.min(FIRSTVIEW_HEIGHT, height);
  
  // First view region
  let firstViewDiffPixels = 0;
  for (let y = 0; y < firstViewHeight; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      // Check if this pixel is marked as different (red in diff image)
      if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0) {
        firstViewDiffPixels++;
      }
    }
  }
  const firstView = (firstViewDiffPixels / (width * firstViewHeight)) * 100;

  // Body region (remaining height)
  let bodyDiffPixels = 0;
  const bodyHeight = height - firstViewHeight;
  if (bodyHeight > 0) {
    for (let y = firstViewHeight; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0) {
          bodyDiffPixels++;
        }
      }
    }
  }
  const body = bodyHeight > 0 ? (bodyDiffPixels / (width * bodyHeight)) * 100 : 0;

  // Generate analysis with improved logic
  let analysis = "";
  const significantThreshold = 5.0; // 5% threshold for significant change
  const minorThreshold = 3.0; // 3% threshold for minor change (changed from 1%)
  
  if (overall < minorThreshold) {
    analysis = "変更なし";
  } else if (firstView > significantThreshold && body < significantThreshold && firstView > body * 2) {
    // First view has significantly more changes than body
    analysis = "FV変更あり";
  } else if (body > significantThreshold && firstView < significantThreshold && body > firstView * 2) {
    // Body has significantly more changes than first view
    analysis = "ボディー変更あり";
  } else if (firstView > significantThreshold && body > significantThreshold) {
    // Both first view and body have significant changes
    analysis = "全体変更あり";
  } else {
    // Minor changes (3-5% overall, but neither region exceeds 5%)
    analysis = "軽微な変更あり";
  }

  const diffImageBuffer = PNG.sync.write(diff);

  return {
    overall,
    firstView,
    body,
    diffImageBuffer,
    analysis
  };
}

/**
 * Monitor a landing page: take screenshot, compare with previous, check links
 */
export async function monitorLandingPage(landingPageId: number): Promise<{
  contentChanged: boolean;
  linkBroken: boolean;
  diffPercentage?: number;
  regionAnalysis?: {
    firstView: number;
    body: number;
    analysis: string;
  };
  message: string;
}> {
  const landingPage = await db.getLandingPageById(landingPageId);
  if (!landingPage) {
    throw new Error("Landing page not found");
  }

  // Check link status with retry
  let linkStatus: { ok: boolean; status?: number; error?: string } = { ok: false, error: "Unknown error" };
  let retries = 0;
  const maxRetries = 2;
  
  while (retries <= maxRetries) {
    try {
      linkStatus = await checkLinkStatus(landingPage.url);
      break;
    } catch (error: any) {
      retries++;
      if (retries > maxRetries) {
        linkStatus = { ok: false, error: `Failed after ${maxRetries} retries: ${error.message}` };
      } else {
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }
  }
  
  if (!linkStatus.ok) {
    const errorDetail = linkStatus.error || `HTTP ${linkStatus.status}`;
    const monitoringHistoryId = await db.createMonitoringHistory({
      landingPageId,
      checkType: "link_broken",
      status: "error",
      message: "リンク切れ",
      regionAnalysis: errorDetail,
    });

    // Send notifications for link broken if enabled
    try {
      const settings = await db.getNotificationSettings(landingPage.userId);
      if (settings && settings.notifyOnBrokenLink) {
        await sendNotifications(
          settings,
          {
            title: "リンク切れを検出しました",
            message: `リンク切れ: ${errorDetail}`,
            lpTitle: landingPage.title ?? landingPage.url,
            lpUrl: landingPage.url,
            changeType: "リンク切れ",
          },
          {
            userId: landingPage.userId,
            landingPageId,
            monitoringHistoryId,
          }
        );
      }
    } catch (error) {
      console.error("[Notification] Failed to send link_broken notification:", error);
    }
    
    return {
      contentChanged: false,
      linkBroken: true,
      message: `リンク切れ: ${errorDetail}`,
    };
  }

  // Capture new screenshot with retry
  let newScreenshotBuffer;
  retries = 0;
  
  while (retries <= maxRetries) {
    try {
      newScreenshotBuffer = await captureScreenshot(landingPage.url);
      break;
    } catch (error: any) {
      retries++;
      if (retries > maxRetries) {
        throw new Error(`スクリーンショット撮影に失敗しました (${maxRetries}回リトライ後): ${error.message}`);
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * retries));
    }
  }
  
  if (!newScreenshotBuffer) {
    throw new Error("スクリーンショット撮影に失敗しました");
  }

  // 以前の最新履歴を取得（比較用と削除用の両方で使用）
  const previousLatestHistory = await db.getMonitoringHistoryByLandingPageId(landingPageId, 1);
  
  // 監視実行時に作成される履歴は常に最新の履歴として扱う
  // （この時点ではまだ履歴が作成されていないため、常に最新）
  const isLatestHistory = true;
  
  let contentChanged = false;
  let diffPercentage = 0;
  let diffImageUrl: string | undefined;
  let newScreenshotUrl: string | undefined;
  let previousScreenshotUrl: string | undefined; // 以前の最新画像（previous_screenshot_urlに設定）
  let regionAnalysisResult = undefined;

  // 以前の最新履歴の画像がある場合は比較を行う
  if (previousLatestHistory.length > 0 && previousLatestHistory[0].screenshotUrl) {
    const previousHistory = previousLatestHistory[0];
    previousScreenshotUrl = previousHistory.screenshotUrl; // 以前の最新画像を保存
    
    // Download previous screenshot (以前の最新画像)
    const previousResponse = await fetch(previousHistory.screenshotUrl);
    const previousBuffer = Buffer.from(await previousResponse.arrayBuffer());

    // Compare screenshots with region analysis
    const comparison = await compareScreenshotsByFirstViewAndBody(previousBuffer, newScreenshotBuffer);
    diffPercentage = comparison.overall;
    
    // Store region analysis
    regionAnalysisResult = {
      firstView: comparison.firstView,
      body: comparison.body,
      analysis: comparison.analysis
    };
    
    // Consider changed if difference is more than 3%
    if (diffPercentage > 3) {
      contentChanged = true;
      
      // 差分がある場合のみ、Storageに新しいスクリーンショットと差分画像を保存
      const timestamp = Date.now();
      const pngFileKey = `screenshots/${landingPageId}/${timestamp}.png`;
      
      // 画像をJPEGに圧縮して保存
      const compressedScreenshot = await compressImageToJpeg(newScreenshotBuffer, 80);
      const jpegFileKey = convertKeyToJpeg(pngFileKey);
      
      // Save new screenshot to Storage (JPEG)
      const result = await storagePut(
        jpegFileKey,
        compressedScreenshot,
        "image/jpeg"
      );
      newScreenshotUrl = result.url;
      
      // Save diff image (差分画像も圧縮)
      if (comparison.diffImageBuffer) {
        const diffPngFileKey = `screenshots/${landingPageId}/${timestamp}_diff.png`;
        const compressedDiffImage = await compressImageToJpeg(comparison.diffImageBuffer, 75); // 差分画像は少し品質を下げる
        const diffJpegFileKey = convertKeyToJpeg(diffPngFileKey);
        
        const diffResult = await storagePut(
          diffJpegFileKey,
          compressedDiffImage,
          "image/jpeg"
        );
        diffImageUrl = diffResult.url;
      }
      
      // 差分が検出されたため、新しいスクリーンショットが保存されました
      // （screenshotsテーブルは使用しないため、更新処理は不要）
    } else {
      // 差分がない場合でも、最新の履歴の場合は画像を保存する
      // 監視実行時は常に最新の履歴として扱う
      const timestamp = Date.now();
      const pngFileKey = `screenshots/${landingPageId}/${timestamp}.png`;
      
      // 画像をJPEGに圧縮して保存
      const compressedScreenshot = await compressImageToJpeg(newScreenshotBuffer, 80);
      const jpegFileKey = convertKeyToJpeg(pngFileKey);
      
      // Save new screenshot to Storage (JPEG, 最新の履歴なので保存)
      const result = await storagePut(
        jpegFileKey,
        compressedScreenshot,
        "image/jpeg"
      );
      newScreenshotUrl = result.url;
      // 差分がない場合は、screenshotsテーブルへの更新は不要
    }
  } else {
    // 初回実行の場合は、変更なしとして保存（クリエイティブと統一）
    contentChanged = false;
    const timestamp = Date.now();
    const pngFileKey = `screenshots/${landingPageId}/${timestamp}.png`;
    
    // 画像をJPEGに圧縮して保存
    const compressedScreenshot = await compressImageToJpeg(newScreenshotBuffer, 80);
    const jpegFileKey = convertKeyToJpeg(pngFileKey);
    
    // Save new screenshot to Storage (JPEG)
    const result = await storagePut(
      jpegFileKey,
      compressedScreenshot,
      "image/jpeg"
    );
    newScreenshotUrl = result.url;
    
    // 初回実行のため、新しいスクリーンショットが保存されました
    // （screenshotsテーブルは使用しないため、更新処理は不要）
  }

  // MessageとRegion Analysisを分離
  let message = "";
  let regionAnalysisText: string | undefined = undefined;
  
  if (previousLatestHistory.length === 0) {
    // 初回取得
    message = "初回取得（基準画像を登録しました）";
    regionAnalysisText = "初回取得";
  } else if (contentChanged) {
    // 変更ありの場合、Region Analysisの結果に基づいてメッセージを決定
    if (regionAnalysisResult) {
      switch (regionAnalysisResult.analysis) {
        case "FV変更あり":
          message = "コンテンツ変更を検出：FV";
          break;
        case "ボディー変更あり":
          message = "コンテンツ変更を検出：ボディー";
          break;
        case "全体変更あり":
          message = "コンテンツ変更を検出：全体";
          break;
        case "軽微な変更あり":
          message = "軽微な変更を検出";
          break;
        default:
          message = "コンテンツ変更を検出";
      }
      // Region Analysisには技術的詳細を保存
      regionAnalysisText = `FV: ${regionAnalysisResult.firstView.toFixed(2)}%, ボディー: ${regionAnalysisResult.body.toFixed(2)}%, 全体: ${diffPercentage.toFixed(2)}%`;
    } else {
      message = "コンテンツ変更を検出";
      regionAnalysisText = `全体: ${diffPercentage.toFixed(2)}%`;
    }
  } else {
    // 変更なし
    message = "変更なし";
    regionAnalysisText = "変更なし";
  }

  // Record monitoring history
  // 最新の履歴（監視実行時に作成される履歴）の場合は、差分がなくてもscreenshotUrlを保存する
  const monitoringHistoryId = await db.createMonitoringHistory({
    landingPageId,
    checkType: "content_change",
    status: contentChanged ? "changed" : (previousLatestHistory.length === 0 ? "ok" : "ok"),
    message,
    screenshotUrl: newScreenshotUrl || undefined, // 最新の履歴なので常に保存
    previousScreenshotUrl: contentChanged ? previousScreenshotUrl : undefined, // 差分があった場合のみ、以前の最新画像を保存
    diffImageUrl,
    diffTopThird: regionAnalysisResult ? regionAnalysisResult.firstView.toFixed(2) : undefined,
    diffMiddleThird: regionAnalysisResult ? regionAnalysisResult.body.toFixed(2) : undefined,
    diffBottomThird: undefined, // 廃止（互換性のため残す）
    regionAnalysis: regionAnalysisText,
  });
  
  // 以前の最新履歴の画像を削除（監視実行後、差分がない場合のみ）
  if (previousLatestHistory.length > 0 && !contentChanged) {
    const previousHistory = previousLatestHistory[0];
    const imagesToDelete: string[] = [];
    
    // スクリーンショット画像を削除（差分がない場合のみ）
    if (previousHistory.screenshotUrl && !previousHistory.previousScreenshotUrl && !previousHistory.diffImageUrl) {
      const key = extractStorageKeyFromUrl(previousHistory.screenshotUrl);
      if (key) {
        imagesToDelete.push(key);
      }
    }
    
    // Storageから削除（差分がない場合の画像のみ削除）
    if (imagesToDelete.length > 0) {
      for (const key of imagesToDelete) {
        try {
          await storageDelete(key);
          console.log(`[Monitoring] Deleted image from previous latest history: ${key}`);
        } catch (error) {
          console.error(`[Monitoring] Failed to delete image ${key}:`, error);
        }
      }
      
      // 監視履歴の画像URLをnullに更新
      const dbInstance = await db.getDb();
      if (dbInstance) {
        const { monitoringHistory } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        await dbInstance
          .update(monitoringHistory)
          .set({ 
            screenshotUrl: null,
            previousScreenshotUrl: null,
            diffImageUrl: null
          })
          .where(eq(monitoringHistory.id, previousHistory.id));
        console.log(`[Monitoring] Updated previous latest history to remove image URLs`);
      }
    }
  }

  // コンテンツ変更時のみ通知（変更なしの「正常終了」は通知しない）
  try {
    const settings = await db.getNotificationSettings(landingPage.userId);
    if (settings && contentChanged && settings.notifyOnChange) {
      // 通知メッセージには、メッセージとRegion Analysisの詳細を含める
      const notificationMessage = regionAnalysisText 
        ? `${message} (${regionAnalysisText})`
        : message;
      await sendNotifications(
        settings,
        {
          title: "コンテンツ変更を検出しました",
          message: notificationMessage,
          lpTitle: landingPage.title ?? landingPage.url,
          lpUrl: landingPage.url,
          changeType: "コンテンツ変更",
          diffImageUrl: diffImageUrl,
        },
        {
          userId: landingPage.userId,
          landingPageId,
          monitoringHistoryId,
        }
      );
    }
  } catch (error) {
    console.error("[Notification] Failed to send content_change notification:", error);
  }

  return {
    contentChanged,
    linkBroken: false,
    diffPercentage,
    regionAnalysis: regionAnalysisResult,
    message, // UI表示用の簡潔なメッセージ
  };
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

/**
 * クリエイティブ監視（画像ハッシュによるシンプルな変更検出）
 */
export async function monitorCreative(creativeId: number): Promise<{
  contentChanged: boolean;
  linkBroken?: boolean;
  message: string;
}> {
  const creative = await db.getCreativeById(creativeId);
  if (!creative) {
    throw new Error("Creative not found");
  }

  // 遷移先URLが設定されている場合、リンクチェックを実行
  if (creative.targetUrl) {
    let linkStatus: { ok: boolean; status?: number; error?: string } = { ok: false, error: "Unknown error" };
    let retries = 0;
    const maxRetries = 2;
    
    while (retries <= maxRetries) {
      try {
        linkStatus = await checkLinkStatus(creative.targetUrl!);
        break;
      } catch (error: any) {
        retries++;
        if (retries > maxRetries) {
          linkStatus = { ok: false, error: `Failed after ${maxRetries} retries: ${error.message}` };
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    }
    
    if (!linkStatus.ok) {
      const errorDetail = linkStatus.error || `HTTP ${linkStatus.status}`;
      const monitoringHistoryId = await db.createMonitoringHistory({
        creativeId,
        targetType: "creative",
        landingPageId: null,
        checkType: "link_broken",
        status: "error",
        message: "リンク切れ",
        regionAnalysis: errorDetail,
      });

      // Send notifications for link broken if enabled
      try {
        const settings = await db.getNotificationSettings(creative.userId);
        if (settings && settings.notifyOnBrokenLink) {
          await sendNotifications(
            settings,
            {
              title: "クリエイティブのリンク切れを検出しました",
              message: `リンク切れ: ${errorDetail}`,
              lpTitle: creative.title,
              lpUrl: creative.targetUrl || creative.imageUrl,
              changeType: "リンク切れ",
            },
            {
              userId: creative.userId,
              monitoringHistoryId,
            }
          );
        }
      } catch (error) {
        console.error("[Notification] Failed to send creative link_broken notification:", error);
      }
      
      return {
        contentChanged: false,
        linkBroken: true,
        message: `リンク切れ: ${errorDetail}`,
      };
    }
  }

  // 画像取得
  let imageBuffer: Buffer;
  try {
    const res = await fetch(creative.imageUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    imageBuffer = Buffer.from(arrayBuffer);
  } catch (error: any) {
    // 取得失敗は error として履歴を記録
    const errorDetail = error?.message ?? String(error);
    const monitoringHistoryId = await db.createMonitoringHistory({
      creativeId,
      targetType: "creative",
      landingPageId: null,
      checkType: "content_change",
      status: "error",
      message: "画像取得に失敗しました",
      regionAnalysis: errorDetail,
    });

      // エラー時にも通知を送る（notifyOnErrorが有効な場合）
      try {
        const settings = await db.getNotificationSettings(creative.userId);
        if (settings && settings.notifyOnError) {
          await sendNotifications(
            settings,
            {
              title: "クリエイティブの監視エラー",
              message: `画像取得に失敗しました: ${errorDetail}`,
              lpTitle: creative.title,
              lpUrl: creative.imageUrl,
              changeType: "エラー",
            },
          {
            userId: creative.userId,
            monitoringHistoryId,
          }
        );
      }
    } catch (notificationError) {
      console.error("[Notification] Failed to send creative error notification:", notificationError);
    }

    return {
      contentChanged: false,
      message: `画像取得に失敗しました: ${errorDetail}`,
    };
  }

  const currentHash = hashBuffer(imageBuffer);

  // 以前の最新履歴を取得（比較用と削除用の両方で使用）
  const previousLatestHistory = await db.getMonitoringHistoryByCreativeId(
    creativeId,
    1
  );
  
  // 監視実行時に作成される履歴は常に最新の履歴として扱う
  const isLatestHistory = true;
  
  let contentChanged = false;
  let message = "";
  let newImageUrl: string | undefined;
  let previousImageUrl: string | undefined; // 以前の最新画像（previous_screenshot_urlに設定）

  // 以前の最新履歴の画像がある場合は比較を行う
  if (previousLatestHistory.length > 0 && previousLatestHistory[0].screenshotUrl) {
    const previousHistory = previousLatestHistory[0];
    previousImageUrl = previousHistory.screenshotUrl; // 以前の最新画像を保存
    
    // Download previous image (以前の最新画像)
    const previousResponse = await fetch(previousHistory.screenshotUrl);
    const previousBuffer = Buffer.from(await previousResponse.arrayBuffer());
    
    // ハッシュ値を比較
    const prevHash = hashBuffer(previousBuffer);
    
    if (currentHash !== prevHash) {
      // 画像が変更された場合
      contentChanged = true;
      message = "コンテンツ変更を検出";
      
      // 差分がある場合のみ、Storageに新しい画像を保存
      const timestamp = Date.now();
      const pngFileKey = `creatives/${creativeId}/${timestamp}.png`;
      
      // 画像をJPEGに圧縮して保存
      const compressedImage = await compressImageToJpeg(imageBuffer, 80);
      const jpegFileKey = convertKeyToJpeg(pngFileKey);
      
      // Save new image to Storage (JPEG)
      const result = await storagePut(
        jpegFileKey,
        compressedImage,
        "image/jpeg"
      );
      newImageUrl = result.url;
      
      // 差分が検出されたため、新しい画像が保存されました
    } else {
      // 画像が変更されていない場合
      contentChanged = false;
      message = "変更なし";
      
      // 差分がない場合でも、最新の履歴の場合は画像を保存する
      // 監視実行時は常に最新の履歴として扱う
      const timestamp = Date.now();
      const pngFileKey = `creatives/${creativeId}/${timestamp}.png`;
      
      // 画像をJPEGに圧縮して保存
      const compressedImage = await compressImageToJpeg(imageBuffer, 80);
      const jpegFileKey = convertKeyToJpeg(pngFileKey);
      
      // Save new image to Storage (JPEG, 最新の履歴なので保存)
      const result = await storagePut(
        jpegFileKey,
        compressedImage,
        "image/jpeg"
      );
      newImageUrl = result.url;
    }
  } else {
    // 初回実行の場合は、変更があったものとして保存
    contentChanged = false;
    message = "初回取得（基準画像を登録しました）";
    const timestamp = Date.now();
    const pngFileKey = `creatives/${creativeId}/${timestamp}.png`;
    
    // 画像をJPEGに圧縮して保存
    const compressedImage = await compressImageToJpeg(imageBuffer, 80);
    const jpegFileKey = convertKeyToJpeg(pngFileKey);
    
    // Save new image to Storage (JPEG)
    const result = await storagePut(
      jpegFileKey,
      compressedImage,
      "image/jpeg"
    );
    newImageUrl = result.url;
    
    // 初回実行のため、新しい画像が保存されました
  }

  // Record monitoring history
  // 最新の履歴（監視実行時に作成される履歴）の場合は、差分がなくてもscreenshotUrlを保存する
  // Region Analysisには常にハッシュ値を保存（画像比較用）
  const regionAnalysisText = currentHash;
  
  let monitoringHistoryId: number;
  try {
    monitoringHistoryId = await db.createMonitoringHistory({
      creativeId,
      landingPageId: null,
      checkType: "content_change",
      status: contentChanged ? "changed" : "ok",
      message,
      screenshotUrl: newImageUrl || undefined, // 最新の履歴なので常に保存
      previousScreenshotUrl: contentChanged ? previousImageUrl : undefined, // 差分があった場合のみ、以前の最新画像を保存
      // ハッシュ値を regionAnalysis に保存（LPとは用途を分けて使用）
      regionAnalysis: regionAnalysisText,
    });
  } catch (error: any) {
    console.error("[Monitoring] Failed to insert creative monitoring history:", {
      error,
      creativeId,
      contentChanged,
      message,
    });
    throw new Error(
      error?.message || "Failed to insert creative monitoring history"
    );
  }
  
  // 以前の最新履歴の画像を削除（監視実行後、差分がない場合のみ）
  if (previousLatestHistory.length > 0 && !contentChanged) {
    const previousHistory = previousLatestHistory[0];
    const imagesToDelete: string[] = [];
    
    // 画像を削除（差分がない場合のみ）
    if (previousHistory.screenshotUrl && !previousHistory.previousScreenshotUrl && !previousHistory.diffImageUrl) {
      const key = extractStorageKeyFromUrl(previousHistory.screenshotUrl);
      if (key) {
        imagesToDelete.push(key);
      }
    }
    
    // Storageから削除（差分がない場合の画像のみ削除）
    if (imagesToDelete.length > 0) {
      for (const key of imagesToDelete) {
        try {
          await storageDelete(key);
          console.log(`[Monitoring] Deleted image from previous latest creative history: ${key}`);
        } catch (error) {
          console.error(`[Monitoring] Failed to delete image ${key}:`, error);
        }
      }
      
      // 監視履歴の画像URLをnullに更新
      const dbInstance = await db.getDb();
      if (dbInstance) {
        const { monitoringHistory } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        await dbInstance
          .update(monitoringHistory)
          .set({ 
            screenshotUrl: null,
            previousScreenshotUrl: null,
            diffImageUrl: null
          })
          .where(eq(monitoringHistory.id, previousHistory.id));
        console.log(`[Monitoring] Updated previous latest creative history to remove image URLs`);
      }
    }
  }

  // コンテンツ変更時のみ通知（LPと同様のポリシー）
  try {
    const settings = await db.getNotificationSettings(creative.userId);
    if (settings && contentChanged && settings.notifyOnChange) {
      // 通知メッセージには、メッセージとRegion Analysis（ハッシュ値）を含める
      const notificationMessage = regionAnalysisText 
        ? `${message} (ハッシュ: ${regionAnalysisText})`
        : message;
      await sendNotifications(
        settings,
        {
          title: "クリエイティブの変更を検出しました",
          message: notificationMessage,
          lpTitle: creative.title,
          lpUrl: creative.targetUrl || creative.imageUrl,
          changeType: "クリエイティブ変更",
        },
        {
          userId: creative.userId,
          monitoringHistoryId,
        }
      );
    }
  } catch (error) {
    console.error(
      "[Notification] Failed to send creative content_change notification:",
      error
    );
  }

  return { contentChanged, message };
}
