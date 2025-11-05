import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Clock, Loader2, Play, Square, Edit, Search, RotateCcw } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";

export default function Schedules() {
  const { data: user } = trpc.auth.me.useQuery();
  const { data: lps } = trpc.lp.list.useQuery();
  const { data: schedules, refetch } = trpc.schedules.list.useQuery();
  const scheduleQuery = trpc.schedules.get.useQuery();
  const upsertSchedule = trpc.schedules.upsert.useMutation();
  const deleteSchedule = trpc.schedules.delete.useMutation();
  const startSchedule = trpc.schedules.start.useMutation();
  const stopSchedule = trpc.schedules.stop.useMutation();
  const resetSchedule = trpc.schedules.reset.useMutation();

  const currentSchedule = scheduleQuery.data;
  const [intervalDays, setIntervalDays] = useState<number>(currentSchedule?.intervalDays || 3);
  const [executeHour, setExecuteHour] = useState<number>(currentSchedule?.executeHour ?? 9);
  const [hasShownAutoAdjustmentToast, setHasShownAutoAdjustmentToast] = useState(false);
  
  // enabledの状態をcurrentScheduleと同期（booleanとして保証）
  const enabled = currentSchedule ? Boolean(currentSchedule.enabled) : false;
  const [excludedLpIds, setExcludedLpIds] = useState<Set<number>>(new Set());
  const [isExcludeDialogOpen, setIsExcludeDialogOpen] = useState(false);
  const [excludeSearchQuery, setExcludeSearchQuery] = useState("");
  const [tempExcludedLpIds, setTempExcludedLpIds] = useState<Set<number>>(new Set());

  // プランに応じた最小監視間隔
  const minIntervalDays = useMemo(() => {
    const plan = (user?.plan as "free" | "light" | "pro") || "free";
    return plan === "pro" ? 1 : 3;
  }, [user?.plan]);

  // 除外LPの初期化
  useEffect(() => {
    if (currentSchedule?.excludedLandingPageIds) {
      try {
        const excludedIds = JSON.parse(currentSchedule.excludedLandingPageIds) as number[];
        setExcludedLpIds(new Set(excludedIds));
      } catch (error) {
        console.error("Failed to parse excluded LP IDs:", error);
      }
    }
  }, [currentSchedule?.excludedLandingPageIds]);

  const planName = useMemo(() => {
    const plan = (user?.plan as "free" | "light" | "pro") || "free";
    const planNames = {
      free: "フリープラン",
      light: "ライトプラン",
      pro: "プロプラン",
    };
    return planNames[plan];
  }, [user?.plan]);

  const handleSaveSchedule = async () => {
    // バリデーション
    if (intervalDays < minIntervalDays) {
      toast.error(`監視間隔は${minIntervalDays}日以上である必要があります`);
      return;
    }
    if (intervalDays < 1) {
      toast.error("監視間隔は1日以上である必要があります");
      return;
    }

    try {
      const result = await upsertSchedule.mutateAsync({
        intervalDays,
        executeHour,
        enabled: true, // スケジュール保存時は常に有効にする
        excludedLandingPageIds: Array.from(excludedLpIds),
      });
      
      // プランに応じて自動調整された場合は通知
      if (result.adjustedIntervalDays) {
        toast.success(`監視間隔を${result.adjustedIntervalDays}日に自動調整しました（プランに応じた最小間隔）`);
        setIntervalDays(result.adjustedIntervalDays);
      } else {
        toast.success("スケジュールを保存しました");
      }
      
      // 少し待ってから再取得（データベースの更新を確実に反映）
      await new Promise(resolve => setTimeout(resolve, 200));
      refetch();
      scheduleQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "保存に失敗しました");
    }
  };

  const handleToggleSchedule = async (checked: boolean) => {
    try {
      if (checked) {
        await startSchedule.mutateAsync();
        toast.success("スケジュールを開始しました");
      } else {
        await stopSchedule.mutateAsync();
        toast.success("スケジュールを一時停止しました");
      }
      refetch();
      scheduleQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "操作に失敗しました");
      scheduleQuery.refetch(); // エラー時も状態をリフレッシュ
    }
  };

  // 除外LP編集ダイアログを開く
  const handleOpenExcludeDialog = () => {
    setTempExcludedLpIds(new Set(excludedLpIds));
    setIsExcludeDialogOpen(true);
  };

  // 除外LP編集ダイアログを閉じて保存
  const handleSaveExcludeDialog = () => {
    setExcludedLpIds(new Set(tempExcludedLpIds));
    setIsExcludeDialogOpen(false);
  };

  // 除外LP編集ダイアログを閉じてキャンセル
  const handleCancelExcludeDialog = () => {
    setTempExcludedLpIds(new Set(excludedLpIds));
    setIsExcludeDialogOpen(false);
  };

  // 検索クエリでフィルタリングされたLPリスト
  const filteredLpsForExclude = useMemo(() => {
    if (!lps) return [];
    if (!excludeSearchQuery.trim()) return lps;
    
    const query = excludeSearchQuery.toLowerCase();
    return lps.filter(lp => 
      (lp.title || "無題").toLowerCase().includes(query) ||
      lp.url.toLowerCase().includes(query)
    );
  }, [lps, excludeSearchQuery]);

  // 除外されているLPのリスト（表示用）
  const excludedLps = useMemo(() => {
    if (!lps) return [];
    return lps.filter(lp => excludedLpIds.has(lp.id));
  }, [lps, excludedLpIds]);

  const handleDeleteSchedule = async () => {
    try {
      await deleteSchedule.mutateAsync();
      toast.success("スケジュールを削除しました");
      refetch();
      scheduleQuery.refetch();
    } catch (error) {
      toast.error("削除に失敗しました");
    }
  };

  // handleToggleScheduleは削除（常に有効のため不要）

  // 既存のスケジュールがある場合は、その値を初期値として設定
  useEffect(() => {
    if (currentSchedule) {
      const previousIntervalDays = intervalDays;
      setIntervalDays(currentSchedule.intervalDays);
      setExecuteHour(currentSchedule.executeHour ?? 9);
      
      // プランに応じて自動調整された場合（間隔が増加した場合）に通知
      if (previousIntervalDays > 0 && currentSchedule.intervalDays > previousIntervalDays && !hasShownAutoAdjustmentToast) {
        const plan = (user?.plan as "free" | "light" | "pro") || "free";
        const minIntervalDays = plan === "pro" ? 1 : 3;
        if (currentSchedule.intervalDays === minIntervalDays) {
          toast.info(`監視間隔を${currentSchedule.intervalDays}日に自動調整しました（プランに応じた最小間隔）`);
          setHasShownAutoAdjustmentToast(true);
        }
      }
    }
  }, [currentSchedule, user?.plan, hasShownAutoAdjustmentToast, intervalDays]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">スケジュール設定</h1>
        <p className="text-muted-foreground mt-2">
          全LPの自動監視スケジュールを設定します
        </p>
      </div>

      {/* Plan Info */}
      <Card>
        <CardHeader>
          <CardTitle>現在のプラン</CardTitle>
          <CardDescription>プランに応じた監視間隔の制限があります</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold">{planName}</p>
              <p className="text-sm text-muted-foreground mt-1">
                最小監視間隔: {user?.plan === "pro" ? "1日" : "3日"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Settings */}
      <Card>
        <CardHeader>
          <CardTitle>スケジュール設定</CardTitle>
          <CardDescription>全LPを一括で監視するスケジュールを設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="interval-days" className="mb-2 block">監視間隔（日）</Label>
            <Input
              id="interval-days"
              type="number"
              min={minIntervalDays}
              value={intervalDays}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= minIntervalDays) {
                  setIntervalDays(value);
                }
              }}
              placeholder={`${minIntervalDays}日以上`}
            />
            <p className="text-sm text-muted-foreground">
              {intervalDays}日ごとに監視します（最小: {minIntervalDays}日）
            </p>
            {intervalDays < minIntervalDays && (
              <p className="text-sm text-red-500">
                {minIntervalDays}日以上である必要があります
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="execute-hour" className="mb-2 block">実行時間帯（時）</Label>
            <Input
              id="execute-hour"
              type="number"
              min={0}
              max={23}
              value={executeHour}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 0 && value <= 23) {
                  setExecuteHour(value);
                }
              }}
              placeholder="9"
            />
            <p className="text-sm text-muted-foreground">
              {executeHour}時に実行します（0-23時）
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="mb-2 block">除外LP</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenExcludeDialog}
              >
                <Edit className="w-4 h-4 mr-2" />
                編集
              </Button>
            </div>
            <div className="border rounded-md p-4 max-h-60 overflow-y-auto">
              {excludedLps.length > 0 ? (
                <div className="space-y-2">
                  {excludedLps.map((lp) => (
                    <div key={lp.id} className="flex items-center space-x-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{lp.title || "無題"}</p>
                        <p className="text-xs text-muted-foreground truncate">{lp.url}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  除外LPはありません
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              除外したLPは自動監視の対象外になります（{excludedLpIds.size}件除外中）
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleSaveSchedule}
              disabled={upsertSchedule.isPending}
            >
              {upsertSchedule.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {currentSchedule ? "スケジュールを更新" : "スケジュールを保存"}
            </Button>
            {currentSchedule && (
              <Button
                variant="destructive"
                onClick={handleDeleteSchedule}
                disabled={deleteSchedule.isPending}
              >
                {deleteSchedule.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                削除
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current Schedule */}
      {currentSchedule && (
        <Card>
          <CardHeader>
            <CardTitle>現在の設定</CardTitle>
            <CardDescription>設定済みのスケジュール情報</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">監視間隔</p>
                <p className="text-lg font-semibold">{currentSchedule.intervalDays}日ごと</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">監視対象</p>
                <p className="text-lg font-semibold">
                  {lps ? lps.length - excludedLpIds.size : 0}件
                  {excludedLpIds.size > 0 && (
                    <span className="text-sm text-muted-foreground ml-1">
                      （全{lps?.length || 0}件中、{excludedLpIds.size}件除外）
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">最終実行</p>
                <p className="text-lg font-semibold">
                  {currentSchedule.lastRunAt
                    ? new Date(currentSchedule.lastRunAt).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "未実行"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">次回実行予定</p>
                <p className="text-lg font-semibold">
                  {currentSchedule.nextRunAt
                    ? new Date(currentSchedule.nextRunAt).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "-"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                {enabled ? (
                  <Play className="w-5 h-5 text-green-500" />
                ) : (
                  <Square className="w-5 h-5 text-gray-400" />
                )}
                <span className="font-medium">
                  {enabled ? "設定中" : "一時停止中"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const result = await resetSchedule.mutateAsync();
                        toast.success(result.message || "スケジュールをリセットしました");
                        refetch();
                        scheduleQuery.refetch();
                      } catch (error: any) {
                        toast.error(error.message || "リセットに失敗しました");
                      }
                    }}
                    disabled={resetSchedule.isPending}
                  >
                    {resetSchedule.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        リセット中...
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4 mr-2" />
                        検証用リセット
                      </>
                    )}
                  </Button>
                )}
                <Switch
                  checked={enabled}
                  onCheckedChange={handleToggleSchedule}
                  disabled={startSchedule.isPending || stopSchedule.isPending}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5" />
            <div>
              <CardTitle>スケジュール実行について</CardTitle>
              <CardDescription>自動監視の仕組み</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• スケジュールは毎日午前9時にチェックされ、設定した間隔が経過していれば全LPを監視します</p>
          <p>• 監視結果は通常の手動チェックと同様に履歴に記録されます</p>
          <p>• 通知設定が有効な場合、変更検出時に自動的に通知が送信されます</p>
          <p>• スケジュールはいつでも一時停止・再開・削除できます</p>
          <p>• プランに応じて最小監視間隔が制限されます（フリー・ライト: 3日、プロ: 1日）</p>
        </CardContent>
      </Card>

      {/* 除外LP編集ダイアログ */}
      <Dialog open={isExcludeDialogOpen} onOpenChange={setIsExcludeDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>除外LPを設定</DialogTitle>
            <DialogDescription>
              自動監視の対象外にしたいLPを選択してください
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* 検索バー */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="LPを検索..."
                value={excludeSearchQuery}
                onChange={(e) => setExcludeSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* LPリスト */}
            <div className="border rounded-md p-4 flex-1 overflow-y-auto">
              {filteredLpsForExclude.length > 0 ? (
                <div className="space-y-2">
                  {filteredLpsForExclude.map((lp) => (
                    <div key={lp.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`temp-exclude-lp-${lp.id}`}
                        checked={tempExcludedLpIds.has(lp.id)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(tempExcludedLpIds);
                          if (checked) {
                            newSet.add(lp.id);
                          } else {
                            newSet.delete(lp.id);
                          }
                          setTempExcludedLpIds(newSet);
                        }}
                      />
                      <Label
                        htmlFor={`temp-exclude-lp-${lp.id}`}
                        className="cursor-pointer flex-1"
                      >
                        <p className="text-sm font-medium">{lp.title || "無題"}</p>
                        <p className="text-xs text-muted-foreground truncate">{lp.url}</p>
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {excludeSearchQuery ? "検索結果がありません" : "LPが登録されていません"}
                </p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {tempExcludedLpIds.size}件のLPを除外中
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelExcludeDialog}
            >
              キャンセル
            </Button>
            <Button onClick={handleSaveExcludeDialog}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
