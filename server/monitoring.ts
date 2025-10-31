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
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    
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
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    
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
 * Monitor a landing page: take screenshot, compare with previous, check links
 */
export async function monitorLandingPage(landingPageId: number): Promise<{
  contentChanged: boolean;
  linkBroken: boolean;
  diffPercentage?: number;
  message: string;
}> {
  const landingPage = await db.getLandingPageById(landingPageId);
  if (!landingPage) {
    throw new Error("Landing page not found");
  }

  // Check link status
  const linkStatus = await checkLinkStatus(landingPage.url);
  
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

  // Capture new screenshot
  const newScreenshotBuffer = await captureScreenshot(landingPage.url);
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

    // Compare screenshots
    const comparison = await compareScreenshots(previousBuffer, newScreenshotBuffer);
    diffPercentage = comparison.diffPercentage;
    
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
  });

  return {
    contentChanged,
    linkBroken: false,
    diffPercentage,
    message: contentChanged 
      ? `コンテンツ変更を検出 (差分: ${diffPercentage.toFixed(2)}%)`
      : "変更なし",
  };
}
