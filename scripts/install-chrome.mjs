import { install, detectBrowserPlatform, resolveBuildId, Browser } from "@puppeteer/browsers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Chrome 142をインストールするディレクトリ
// Vercel環境では/tmp/puppeteerを使用するが、ビルド時はローカルの.cache/puppeteerを使用
const cacheDir = process.env.VERCEL 
  ? "/tmp/puppeteer" 
  : path.join(projectRoot, ".cache", "puppeteer");

async function installChrome() {
  console.log("[Build] Installing latest Chrome...");
  console.log(`[Build] Cache directory: ${cacheDir}`);
  
  try {
    const platform = detectBrowserPlatform();
    if (!platform) {
      throw new Error("Could not detect browser platform");
    }
    
    console.log(`[Build] Platform: ${platform}`);
    
    // 最新のChromeのビルドIDを取得（常に最新版を使用）
    console.log("[Build] Resolving latest Chrome build ID...");
    const buildId = await resolveBuildId(Browser.CHROMIUM, platform, "latest");
    console.log(`[Build] Resolved latest Chrome build ID: ${buildId}`);
    
    // キャッシュディレクトリが存在しない場合は作成
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
      console.log(`[Build] Created cache directory: ${cacheDir}`);
    }
    
    // Chromeをインストール
    console.log(`[Build] Installing Chrome ${buildId}...`);
    await install({
      browser: Browser.CHROMIUM,
      buildId,
      cacheDir,
      platform,
    });
    
    console.log(`[Build] Chrome ${buildId} installed successfully`);
    console.log(`[Build] Chrome is ready for use in Vercel environment`);
    
  } catch (error) {
    console.error(`[Build] Failed to install Chrome: ${error.message}`);
    console.error(`[Build] Chrome will be installed at runtime if needed`);
    // エラーが発生してもビルドは続行
    process.exit(0);
  }
}

// Vercel環境でのみ実行（ビルド時）
if (process.env.VERCEL || process.env.CI) {
  installChrome().catch((error) => {
    console.error(`[Build] Chrome installation error: ${error.message}`);
    process.exit(0); // エラーが発生してもビルドは続行
  });
} else {
  console.log("[Build] Not in Vercel/CI environment, skipping Chrome installation");
  console.log("[Build] Chrome will be installed at runtime if needed");
}

