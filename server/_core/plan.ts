/**
 * プラン設定とバリデーション
 */

export type Plan = "free" | "light" | "pro" | "admin";

export const PLAN_CONFIG = {
  free: {
    name: "フリープラン",
    minIntervalDays: 14, // 最小14日に1回
    maxLpCount: 3, // 最大LP登録数
    maxCreativeCount: 10, // 最大クリエイティブ登録数
    maxDailyManualMonitorCount: 5, // 1日の手動監視実行回数制限
    historyRetentionDays: 30, // 監視履歴の保存期間（日）
  },
  light: {
    name: "ライトプラン",
    minIntervalDays: 7, // 最小7日に1回
    maxLpCount: 10, // 最大LP登録数
    maxCreativeCount: 30, // 最大クリエイティブ登録数
    maxDailyManualMonitorCount: 50, // 1日の手動監視実行回数制限
    historyRetentionDays: 90, // 監視履歴の保存期間（日）
  },
  pro: {
    name: "プロプラン",
    minIntervalDays: 3, // 最小3日に1回
    maxLpCount: 100, // 最大LP登録数
    maxCreativeCount: 300, // 最大クリエイティブ登録数
    maxDailyManualMonitorCount: 200, // 1日の手動監視実行回数制限
    historyRetentionDays: 365, // 監視履歴の保存期間（日）
  },
  admin: {
    name: "管理者プラン",
    minIntervalDays: 1, // 最小1日に1回（管理者は最短間隔も使用可能）
    maxLpCount: null, // 無制限
    maxCreativeCount: null, // 無制限
    maxDailyManualMonitorCount: null, // 無制限
    historyRetentionDays: null, // 無制限（削除しない）
  },
} as const;

/**
 * プランに応じた最小監視間隔（日）を取得
 */
export function getMinIntervalDays(plan: Plan): number {
  return PLAN_CONFIG[plan].minIntervalDays;
}

/**
 * 指定された間隔がプランで許可されているかチェック
 */
export function validateIntervalDays(plan: Plan, intervalDays: number): {
  valid: boolean;
  error?: string;
} {
  const minIntervalDays = getMinIntervalDays(plan);
  
  if (intervalDays < minIntervalDays) {
    return {
      valid: false,
      error: `${PLAN_CONFIG[plan].name}では、監視間隔は${minIntervalDays}日以上に設定する必要があります。`,
    };
  }
  
  if (intervalDays < 1) {
    return {
      valid: false,
      error: "監視間隔は1日以上である必要があります。",
    };
  }
  
  return { valid: true };
}

/**
 * プランに応じた利用可能な監視間隔のオプションを取得
 */
export function getAvailableIntervalOptions(plan: Plan): Array<{ value: number; label: string; disabled?: boolean }> {
  const minIntervalDays = getMinIntervalDays(plan);
  
  const options = [
    { value: 1, label: "1日ごと" },
    { value: 2, label: "2日ごと" },
    { value: 3, label: "3日ごと" },
    { value: 7, label: "7日ごと" },
    { value: 14, label: "14日ごと" },
    { value: 30, label: "30日ごと" },
  ];
  
  return options.map(option => ({
    ...option,
    disabled: option.value < minIntervalDays,
  }));
}

/**
 * プランに応じた監視履歴の保存期間（日）を取得
 */
export function getHistoryRetentionDays(plan: Plan): number | null {
  return PLAN_CONFIG[plan].historyRetentionDays ?? null;
}

