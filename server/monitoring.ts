import puppeteer from "puppeteer";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { storagePut, storageGet, storageDelete, extractStorageKeyFromUrl } from "./storage";
import * as db from "./db";

/**
 * Take a screenshot of a URL and return the buffer
 */
export async function captureScreenshot(url: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

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
  } finally {
    await browser.close();
  }
}

/**
 * Check if a URL is accessible (not broken)
 */
export async function checkLinkStatus(url: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

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
    await db.createMonitoringHistory({
      landingPageId,
      checkType: "link_broken",
      status: "error",
      message: linkStatus.error || `HTTP ${linkStatus.status}`,
    });
    
    return {
      contentChanged: false,
      linkBroken: true,
      message: `リンク切れを検出: ${linkStatus.error || `HTTP ${linkStatus.status}`}`,
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
      const fileKey = `screenshots/${landingPageId}/${timestamp}.png`;
      
      // Save new screenshot to Storage
      const result = await storagePut(
        fileKey,
        newScreenshotBuffer,
        "image/png"
      );
      newScreenshotUrl = result.url;
      
      // Save diff image
      if (comparison.diffImageBuffer) {
        const diffFileKey = `screenshots/${landingPageId}/${timestamp}_diff.png`;
        const diffResult = await storagePut(
          diffFileKey,
          comparison.diffImageBuffer,
          "image/png"
        );
        diffImageUrl = diffResult.url;
      }
      
      // 差分が検出されたため、新しいスクリーンショットが保存されました
      // （screenshotsテーブルは使用しないため、更新処理は不要）
    } else {
      // 差分がない場合でも、最新の履歴の場合は画像を保存する
      // 監視実行時は常に最新の履歴として扱う
      const timestamp = Date.now();
      const fileKey = `screenshots/${landingPageId}/${timestamp}.png`;
      
      // Save new screenshot to Storage (最新の履歴なので保存)
      const result = await storagePut(
        fileKey,
        newScreenshotBuffer,
        "image/png"
      );
      newScreenshotUrl = result.url;
      // 差分がない場合は、screenshotsテーブルへの更新は不要
    }
  } else {
    // 初回実行の場合は、変更があったものとして保存
    contentChanged = true;
    const timestamp = Date.now();
    const fileKey = `screenshots/${landingPageId}/${timestamp}.png`;
    
    // Save new screenshot to Storage
    const result = await storagePut(
      fileKey,
      newScreenshotBuffer,
      "image/png"
    );
    newScreenshotUrl = result.url;
    
    // 初回実行のため、新しいスクリーンショットが保存されました
    // （screenshotsテーブルは使用しないため、更新処理は不要）
  }

  // Record monitoring history
  // 最新の履歴（監視実行時に作成される履歴）の場合は、差分がなくてもscreenshotUrlを保存する
  await db.createMonitoringHistory({
    landingPageId,
    checkType: "content_change",
    status: contentChanged ? "changed" : "ok",
    message: contentChanged 
      ? `コンテンツ変更を検出 (差分: ${diffPercentage.toFixed(2)}%)`
      : "変更なし",
    screenshotUrl: newScreenshotUrl || undefined, // 最新の履歴なので常に保存
    previousScreenshotUrl: contentChanged ? previousScreenshotUrl : undefined, // 差分があった場合のみ、以前の最新画像を保存
    diffImageUrl,
    diffTopThird: regionAnalysisResult ? regionAnalysisResult.firstView.toFixed(2) : undefined,
    diffMiddleThird: regionAnalysisResult ? regionAnalysisResult.body.toFixed(2) : undefined,
    diffBottomThird: undefined, // 廃止（互換性のため残す）
    regionAnalysis: regionAnalysisResult ? regionAnalysisResult.analysis : undefined,
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

  let message = contentChanged 
    ? `コンテンツ変更を検出 (差分: ${diffPercentage.toFixed(2)}%)`
    : "変更なし";
  
  if (regionAnalysisResult) {
    message += ` - ${regionAnalysisResult.analysis}`;
  }

  return {
    contentChanged,
    linkBroken: false,
    diffPercentage,
    regionAnalysis: regionAnalysisResult,
    message,
  };
}
