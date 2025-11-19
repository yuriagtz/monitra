/**
 * 古い監視履歴の削除機能
 * プラン別の保存期間に基づいて古い履歴を削除
 */

import * as db from "./db";
import { getHistoryRetentionDays } from "./_core/plan";
import { storageDelete, extractStorageKeyFromUrl } from "./storage";
import { users } from "../drizzle/schema";

/**
 * 全ユーザーの古い監視履歴を削除
 * @returns 削除結果のサマリー
 */
export async function cleanupOldHistoryForAllUsers(): Promise<{
  totalDeletedCount: number;
  totalDeletedImages: number;
  results: Array<{ userId: number; plan: string; deletedCount: number; deletedImages: number }>;
}> {
  const database = await db.getDb();
  if (!database) {
    throw new Error("Database not available");
  }

  // 全ユーザーを取得
  const allUsers = await database.select().from(users);
  
  const results: Array<{ userId: number; plan: string; deletedCount: number; deletedImages: number }> = [];
  let totalDeletedCount = 0;
  let totalDeletedImages = 0;

  for (const user of allUsers) {
    const userPlan = (user.plan as "free" | "light" | "pro" | "admin") || "free";
    const retentionDays = getHistoryRetentionDays(userPlan);

    // 保存期間がnull（無制限）の場合はスキップ
    if (retentionDays === null) {
      continue;
    }

    try {
      // ユーザーの古い履歴を削除
      const { deletedCount, deletedImageUrls } = await db.deleteOldMonitoringHistory(
        user.id,
        retentionDays
      );

      // 画像をストレージから削除
      let deletedImages = 0;
      for (const imageUrl of deletedImageUrls) {
        try {
          const storageKey = extractStorageKeyFromUrl(imageUrl);
          if (storageKey) {
            await storageDelete(storageKey);
            deletedImages++;
          }
        } catch (error) {
          console.error(`[Cleanup] Failed to delete image ${imageUrl}:`, error);
          // 画像の削除に失敗しても続行
        }
      }

      if (deletedCount > 0) {
        results.push({
          userId: user.id,
          plan: userPlan,
          deletedCount,
          deletedImages,
        });
        totalDeletedCount += deletedCount;
        totalDeletedImages += deletedImages;
      }
    } catch (error) {
      console.error(`[Cleanup] Failed to cleanup history for user ${user.id}:`, error);
      // ユーザーごとのエラーは続行
    }
  }

  return {
    totalDeletedCount,
    totalDeletedImages,
    results,
  };
}

