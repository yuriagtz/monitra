// Supabase Storage helpers for file uploads
// Uses Supabase Storage for screenshots and other files

import { createAdminClient } from './_core/supabase';
import { ENV } from './_core/env';

const BUCKET_NAME = 'screenshots'; // Supabase Storage bucket name

function normalizeKey(relKey: string): string {
  // Remove leading slashes and normalize path
  return relKey.replace(/^\/+/, "");
}

/**
 * Ensure the storage bucket exists, create if it doesn't
 */
async function ensureBucket() {
  const supabase = createAdminClient();
  
  // Check if bucket exists
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  
  if (listError) {
    console.error("[Storage] Error listing buckets:", listError);
    throw new Error(`Failed to access storage: ${listError.message}`);
  }
  
  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);
  
  if (!bucketExists) {
    // Create bucket if it doesn't exist
    const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true, // Make bucket public for easy access
      fileSizeLimit: 52428800, // 50MB limit
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'],
    });
    
    if (error) {
      console.error("[Storage] Error creating bucket:", error);
      throw new Error(`Failed to create storage bucket: ${error.message}`);
    }
    
    console.log(`[Storage] Created bucket: ${BUCKET_NAME}`);
  }
}

/**
 * Upload a file to Supabase Storage
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase Storage credentials missing: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createAdminClient();
  const key = normalizeKey(relKey);
  
  // Ensure bucket exists
  await ensureBucket();
  
  // Convert data to Buffer if needed
  let buffer: Buffer;
  if (typeof data === 'string') {
    buffer = Buffer.from(data, 'utf-8');
  } else if (data instanceof Uint8Array) {
    buffer = Buffer.from(data);
  } else {
    buffer = data;
  }
  
  // Upload file
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(key, buffer, {
      contentType,
      upsert: true, // Overwrite if exists
    });
  
  if (uploadError) {
    console.error("[Storage] Upload error:", uploadError);
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(key);
  
  if (!urlData?.publicUrl) {
    throw new Error("Failed to get public URL for uploaded file");
  }
  
  return {
    key,
    url: urlData.publicUrl,
  };
}

/**
 * Get a file URL from Supabase Storage
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase Storage credentials missing: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createAdminClient();
  const key = normalizeKey(relKey);
  
  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(key);
  
  if (!urlData?.publicUrl) {
    throw new Error(`File not found: ${key}`);
  }
  
  return {
    key,
    url: urlData.publicUrl,
  };
}

/**
 * Delete a file from Supabase Storage
 */
export async function storageDelete(relKey: string): Promise<void> {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase Storage credentials missing: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  const supabase = createAdminClient();
  const key = normalizeKey(relKey);
  
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([key]);
  
  if (error) {
    console.error("[Storage] Delete error:", error);
    // ファイルが存在しない場合はエラーを無視
    if (error.message && !error.message.includes('not found')) {
      throw new Error(`Storage delete failed: ${error.message}`);
    }
  }
}

/**
 * Extract storage key from URL
 */
export function extractStorageKeyFromUrl(url: string): string | null {
  try {
    // Supabase StorageのURLからキーを抽出
    // 例: https://xxx.supabase.co/storage/v1/object/public/screenshots/screenshots/5/1234567890.jpg
    // または: https://xxx.supabase.co/storage/v1/object/public/screenshots/screenshots/5/1234567890_diff.jpg
    // または: https://xxx.supabase.co/storage/v1/object/public/screenshots/creatives/5/1234567890.jpg
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    
    // "screenshots" または "creatives" バケットを検索
    const bucketIndex = pathParts.findIndex(part => part === 'screenshots' || part === 'creatives');
    
    if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
      // バケット名以降の部分を結合
      // 例: /storage/v1/object/public/screenshots/screenshots/5/1234567890.jpg
      //     -> screenshots/5/1234567890.jpg
      return pathParts.slice(bucketIndex + 1).join('/');
    }
    
    // フォールバック: 正規表現で抽出（screenshots または creatives）
    const match = url.match(/\/(screenshots|creatives)\/(.+)$/);
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
    return null;
  } catch {
    return null;
  }
}