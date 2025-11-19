/**
 * 画像圧縮機能
 * PNGからJPEGへの変換（品質80%）でサイズを削減
 */

import sharp from "sharp";

/**
 * PNGバッファをJPEGに変換して圧縮
 * @param pngBuffer PNG形式のバッファ
 * @param quality JPEG品質（0-100、デフォルト80）
 * @returns JPEG形式のバッファ
 */
export async function compressImageToJpeg(
  pngBuffer: Buffer,
  quality: number = 80
): Promise<Buffer> {
  try {
    const jpegBuffer = await sharp(pngBuffer)
      .jpeg({ quality })
      .toBuffer();
    
    return jpegBuffer;
  } catch (error) {
    console.error("[Image Compression] Failed to compress image:", error);
    // 圧縮に失敗した場合は元のPNGバッファを返す
    return pngBuffer;
  }
}

/**
 * 画像の拡張子とMIMEタイプをJPEG用に変更
 * @param originalKey 元のファイルキー（例: `screenshots/123/1234567890.png`）
 * @returns JPEG用のファイルキー（例: `screenshots/123/1234567890.jpg`）
 */
export function convertKeyToJpeg(originalKey: string): string {
  // .png を .jpg に置換
  return originalKey.replace(/\.png$/i, ".jpg");
}

