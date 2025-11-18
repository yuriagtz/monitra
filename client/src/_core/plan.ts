/**
 * プラン設定とバリデーション（クライアント側）
 * サーバー側の設定（server/_core/plan.ts）と同期を保つ
 */

export type Plan = "free" | "light" | "pro" | "admin";

export const PLAN_CONFIG = {
  free: {
    name: "フリープラン",
    minIntervalDays: 3, // 最小3日に1回
    maxLpCount: 3, // 最大LP登録数
    maxCreativeCount: 10, // 最大クリエイティブ登録数
    maxDailyManualMonitorCount: 10, // 1日の手動監視実行回数制限
  },
  light: {
    name: "ライトプラン",
    minIntervalDays: 3, // 最小3日に1回
    maxLpCount: 15, // 最大LP登録数
    maxCreativeCount: 50, // 最大クリエイティブ登録数
    maxDailyManualMonitorCount: 50, // 1日の手動監視実行回数制限
  },
  pro: {
    name: "プロプラン",
    minIntervalDays: 1, // 最小1日に1回
    maxLpCount: null, // 無制限
    maxCreativeCount: null, // 無制限
    maxDailyManualMonitorCount: 200, // 1日の手動監視実行回数制限
  },
  admin: {
    name: "管理者プラン",
    minIntervalDays: 1, // 最小1日に1回（管理者は最短間隔も使用可能）
    maxLpCount: null, // 無制限
    maxCreativeCount: null, // 無制限
    maxDailyManualMonitorCount: null, // 無制限
  },
} as const;

/**
 * プランに応じた最小監視間隔（日）を取得
 */
export function getMinIntervalDays(plan: Plan): number {
  return PLAN_CONFIG[plan].minIntervalDays;
}

