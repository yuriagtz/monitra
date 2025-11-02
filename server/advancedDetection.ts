import { PNG } from "pngjs";
import sharp from "sharp";
import Tesseract from "tesseract.js";

/**
 * Extract text from screenshot using OCR
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<string> {
  try {
    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng+jpn', {
      logger: () => {}, // Suppress logs
    });
    return text.trim();
  } catch (error) {
    console.error('[OCR] Error extracting text:', error);
    return '';
  }
}

/**
 * Detect text changes between two screenshots
 */
export async function detectTextChanges(
  previousBuffer: Buffer,
  currentBuffer: Buffer
): Promise<{
  changed: boolean;
  similarity: number;
  previousText: string;
  currentText: string;
}> {
  const previousText = await extractTextFromImage(previousBuffer);
  const currentText = await extractTextFromImage(currentBuffer);
  
  const similarity = calculateTextSimilarity(previousText, currentText);
  const changed = similarity < 0.95; // 95% similarity threshold
  
  return {
    changed,
    similarity,
    previousText,
    currentText,
  };
}

/**
 * Calculate text similarity using Levenshtein distance
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  if (text1 === text2) return 1.0;
  if (text1.length === 0 || text2.length === 0) return 0.0;
  
  const maxLength = Math.max(text1.length, text2.length);
  const distance = levenshteinDistance(text1, text2);
  return 1 - (distance / maxLength);
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Extract dominant colors from image
 */
export async function extractDominantColors(imageBuffer: Buffer, count: number = 5): Promise<string[]> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(100, 100, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Simple color quantization
    const colorMap = new Map<string, number>();
    
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.floor(data[i] / 32) * 32;
      const g = Math.floor(data[i + 1] / 32) * 32;
      const b = Math.floor(data[i + 2] / 32) * 32;
      const color = `rgb(${r},${g},${b})`;
      colorMap.set(color, (colorMap.get(color) || 0) + 1);
    }
    
    // Sort by frequency and get top colors
    const sortedColors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([color]) => color);
    
    return sortedColors;
  } catch (error) {
    console.error('[Color] Error extracting colors:', error);
    return [];
  }
}

/**
 * Detect color changes between two screenshots
 */
export async function detectColorChanges(
  previousBuffer: Buffer,
  currentBuffer: Buffer
): Promise<{
  changed: boolean;
  previousColors: string[];
  currentColors: string[];
  similarity: number;
}> {
  const previousColors = await extractDominantColors(previousBuffer);
  const currentColors = await extractDominantColors(currentBuffer);
  
  // Calculate color similarity
  const commonColors = previousColors.filter(c => currentColors.includes(c)).length;
  const similarity = commonColors / Math.max(previousColors.length, currentColors.length);
  const changed = similarity < 0.7; // 70% similarity threshold
  
  return {
    changed,
    previousColors,
    currentColors,
    similarity,
  };
}

/**
 * Detect specific region changes (header, footer, CTA)
 */
export async function detectRegionChanges(
  previousBuffer: Buffer,
  currentBuffer: Buffer,
  regions: { name: string; top: number; height: number }[]
): Promise<{
  regionName: string;
  changed: boolean;
  diffPercentage: number;
}[]> {
  const results: { regionName: string; changed: boolean; diffPercentage: number }[] = [];
  
  try {
    const img1 = PNG.sync.read(previousBuffer);
    const img2 = PNG.sync.read(currentBuffer);
    
    // Resize images to match if needed
    let img2Data = img2.data;
    if (img1.width !== img2.width || img1.height !== img2.height) {
      const resized = await sharp(currentBuffer)
        .resize(img1.width, img1.height)
        .png()
        .toBuffer();
      const resizedPng = PNG.sync.read(resized);
      img2Data = resizedPng.data;
    }
    
    for (const region of regions) {
      const startY = Math.floor(img1.height * region.top);
      const endY = Math.floor(img1.height * (region.top + region.height));
      
      let diffPixels = 0;
      let totalPixels = 0;
      
      for (let y = startY; y < endY && y < img1.height; y++) {
        for (let x = 0; x < img1.width; x++) {
          const idx = (img1.width * y + x) << 2;
          
          const r1 = img1.data[idx];
          const g1 = img1.data[idx + 1];
          const b1 = img1.data[idx + 2];
          
          const r2 = img2Data[idx];
          const g2 = img2Data[idx + 1];
          const b2 = img2Data[idx + 2];
          
          const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
          if (diff > 30) {
            diffPixels++;
          }
          totalPixels++;
        }
      }
      
      const diffPercentage = (diffPixels / totalPixels) * 100;
      results.push({
        regionName: region.name,
        changed: diffPercentage > 1.0,
        diffPercentage,
      });
    }
  } catch (error) {
    console.error('[Region] Error detecting region changes:', error);
  }
  
  return results;
}

/**
 * Comprehensive advanced detection
 */
export async function runAdvancedDetection(
  previousBuffer: Buffer,
  currentBuffer: Buffer
): Promise<{
  textChanges: Awaited<ReturnType<typeof detectTextChanges>>;
  colorChanges: Awaited<ReturnType<typeof detectColorChanges>>;
  regionChanges: Awaited<ReturnType<typeof detectRegionChanges>>;
}> {
  const [textChanges, colorChanges, regionChanges] = await Promise.all([
    detectTextChanges(previousBuffer, currentBuffer),
    detectColorChanges(previousBuffer, currentBuffer),
    detectRegionChanges(previousBuffer, currentBuffer, [
      { name: 'Header', top: 0, height: 0.15 },
      { name: 'Main Content', top: 0.15, height: 0.7 },
      { name: 'Footer', top: 0.85, height: 0.15 },
    ]),
  ]);
  
  return {
    textChanges,
    colorChanges,
    regionChanges,
  };
}
