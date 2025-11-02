import puppeteer from "puppeteer";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { storagePut, storageGet } from "./storage";
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
    await page.setViewport({ width: 1280, height: 800 });
    
    // Set longer timeout and use domcontentloaded instead of networkidle0
    await page.goto(url, { 
      waitUntil: "domcontentloaded", 
      timeout: 60000 
    });
    
    // Wait a bit for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const screenshot = await page.screenshot({ fullPage: true });
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
 * Compare screenshots by regions (top, middle, bottom)
 * Returns detailed analysis of which parts changed
 */
export async function compareScreenshotsByRegion(
  img1Buffer: Buffer,
  img2Buffer: Buffer
): Promise<{
  overall: number;
  topThird: number;
  middleThird: number;
  bottomThird: number;
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

  // Divide into three regions
  const regionHeight = Math.floor(height / 3);
  
  // Top third (first view)
  let topDiffPixels = 0;
  for (let y = 0; y < regionHeight; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      // Check if this pixel is marked as different (red in diff image)
      if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0) {
        topDiffPixels++;
      }
    }
  }
  const topThird = (topDiffPixels / (width * regionHeight)) * 100;

  // Middle third
  let middleDiffPixels = 0;
  for (let y = regionHeight; y < regionHeight * 2; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0) {
        middleDiffPixels++;
      }
    }
  }
  const middleThird = (middleDiffPixels / (width * regionHeight)) * 100;

  // Bottom third
  let bottomDiffPixels = 0;
  for (let y = regionHeight * 2; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0) {
        bottomDiffPixels++;
      }
    }
  }
  const bottomThird = (bottomDiffPixels / (width * (height - regionHeight * 2))) * 100;

  // Generate analysis with improved logic
  let analysis = "";
  const significantThreshold = 5.0; // 5% threshold for significant change
  const minorThreshold = 1.0; // 1% threshold for minor change
  
  // Check if top has significantly more changes than middle and bottom
  const topDominant = topThird > significantThreshold && 
                      topThird > (middleThird * 2) && 
                      topThird > (bottomThird * 2);
  
  if (overall < minorThreshold) {
    analysis = "変更なし";
  } else if (topDominant) {
    // Top section has significantly more changes
    analysis = "ファーストビュー(上部)のみ変更あり";
  } else {
    // Check which regions have significant changes
    const changedRegions = [];
    if (topThird > significantThreshold) changedRegions.push("上部");
    if (middleThird > significantThreshold) changedRegions.push("中部");
    if (bottomThird > significantThreshold) changedRegions.push("下部");
    
    if (changedRegions.length === 0) {
      analysis = "軽微な変更あり";
    } else if (changedRegions.length === 3) {
      analysis = "ページ全体が大きく変更されています";
    } else if (changedRegions.length === 1) {
      analysis = `${changedRegions[0]}のみ大きく変更されています`;
    } else {
      analysis = `${changedRegions.join("と")}が大きく変更されています`;
    }
  }

  const diffImageBuffer = PNG.sync.write(diff);

  return {
    overall,
    topThird,
    middleThird,
    bottomThird,
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
    topThird: number;
    middleThird: number;
    bottomThird: number;
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
  const timestamp = Date.now();
  const fileKey = `screenshots/${landingPageId}/${timestamp}.png`;
  
  const { url: newScreenshotUrl } = await storagePut(
    fileKey,
    newScreenshotBuffer,
    "image/png"
  );

  // Get previous screenshot
  const previousScreenshot = await db.getScreenshotByLandingPageId(landingPageId);
  
  let contentChanged = false;
  let diffPercentage = 0;
  let diffImageUrl: string | undefined;

  if (previousScreenshot) {
    // Download previous screenshot
    const previousResponse = await fetch(previousScreenshot.screenshotUrl);
    const previousBuffer = Buffer.from(await previousResponse.arrayBuffer());

    // Compare screenshots with region analysis
    const comparison = await compareScreenshotsByRegion(previousBuffer, newScreenshotBuffer);
    diffPercentage = comparison.overall;
    
    // Store region analysis
    const regionAnalysis = {
      topThird: comparison.topThird,
      middleThird: comparison.middleThird,
      bottomThird: comparison.bottomThird,
      analysis: comparison.analysis
    };
    
    // Consider changed if difference is more than 1%
    if (diffPercentage > 1) {
      contentChanged = true;
      
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
    }
  }
  
  // Prepare region analysis for return
  let regionAnalysisResult = undefined;
  if (previousScreenshot) {
    const previousResponse = await fetch(previousScreenshot.screenshotUrl);
    const previousBuffer = Buffer.from(await previousResponse.arrayBuffer());
    const comparison = await compareScreenshotsByRegion(previousBuffer, newScreenshotBuffer);
    regionAnalysisResult = {
      topThird: comparison.topThird,
      middleThird: comparison.middleThird,
      bottomThird: comparison.bottomThird,
      analysis: comparison.analysis
    };
  }

  // Update latest screenshot
  await db.upsertScreenshot({
    landingPageId,
    screenshotUrl: newScreenshotUrl,
    fileKey,
    capturedAt: new Date(),
  });

  // Record monitoring history
  await db.createMonitoringHistory({
    landingPageId,
    checkType: "content_change",
    status: contentChanged ? "changed" : "ok",
    message: contentChanged 
      ? `コンテンツ変更を検出 (差分: ${diffPercentage.toFixed(2)}%)`
      : "変更なし",
    screenshotUrl: newScreenshotUrl,
    previousScreenshotUrl: previousScreenshot?.screenshotUrl,
    diffImageUrl,
    diffTopThird: regionAnalysisResult ? regionAnalysisResult.topThird.toFixed(2) : undefined,
    diffMiddleThird: regionAnalysisResult ? regionAnalysisResult.middleThird.toFixed(2) : undefined,
    diffBottomThird: regionAnalysisResult ? regionAnalysisResult.bottomThird.toFixed(2) : undefined,
    regionAnalysis: regionAnalysisResult ? regionAnalysisResult.analysis : undefined,
  });

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
