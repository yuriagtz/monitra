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
  const { data: landingPages } = trpc.landingPages.list.useQuery();
  const { data: creatives } = trpc.creatives.list.useQuery();
  const { data: schedules, refetch } = trpc.schedules.list.useQuery();
  const scheduleQuery = trpc.schedules.get.useQuery();
  const upsertSchedule = trpc.schedules.upsert.useMutation();
  const deleteSchedule = trpc.schedules.delete.useMutation();
  const startSchedule = trpc.schedules.start.useMutation();
  const stopSchedule = trpc.schedules.stop.useMutation();
  const resetSchedule = trpc.schedules.reset.useMutation();

  // Creative schedules
  const { data: creativeSchedules, refetch: refetchCreativeSchedules } = trpc.creativeSchedules.list.useQuery();
  const creativeScheduleQuery = trpc.creativeSchedules.get.useQuery();
  const upsertCreativeSchedule = trpc.creativeSchedules.upsert.useMutation();
  const deleteCreativeSchedule = trpc.creativeSchedules.delete.useMutation();
  const startCreativeSchedule = trpc.creativeSchedules.start.useMutation();
  const stopCreativeSchedule = trpc.creativeSchedules.stop.useMutation();
  const resetCreativeSchedule = trpc.creativeSchedules.reset.useMutation();

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

  // Creative schedule states
  const currentCreativeSchedule = creativeScheduleQuery.data;
  const [creativeIntervalDays, setCreativeIntervalDays] = useState<number>(currentCreativeSchedule?.intervalDays || 3);
  const [creativeExecuteHour, setCreativeExecuteHour] = useState<number>(currentCreativeSchedule?.executeHour ?? 9);
  const [hasShownCreativeAutoAdjustmentToast, setHasShownCreativeAutoAdjustmentToast] = useState(false);
  const creativeEnabled = currentCreativeSchedule ? Boolean(currentCreativeSchedule.enabled) : false;
  const [excludedCreativeIds, setExcludedCreativeIds] = useState<Set<number>>(new Set());
  const [isExcludeCreativeDialogOpen, setIsExcludeCreativeDialogOpen] = useState(false);
  const [excludeCreativeSearchQuery, setExcludeCreativeSearchQuery] = useState("");
  const [tempExcludedCreativeIds, setTempExcludedCreativeIds] = useState<Set<number>>(new Set());

  // プランに応じた最小監視間隔
  const minIntervalDays = useMemo(() => {
    const plan = (user?.plan as "free" | "light" | "pro" | "admin") || "free";
    return plan === "pro" || plan === "admin" ? 1 : 3;
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
    const plan = (user?.plan as "free" | "light" | "pro" | "admin") || "free";
    const planNames = {
      free: "フリープラン",
      light: "ライトプラン",
      pro: "プロプラン",
      admin: "管理者プラン",
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
  const filteredLandingPagesForExclude = useMemo(() => {
    if (!landingPages) return [];
    if (!excludeSearchQuery.trim()) return landingPages;
    
    const query = excludeSearchQuery.toLowerCase();
    return landingPages.filter(landingPage => 
      (landingPage.title || "無題").toLowerCase().includes(query) ||
      landingPage.url.toLowerCase().includes(query)
    );
  }, [landingPages, excludeSearchQuery]);

  // 除外されているLPのリスト（表示用）
  const excludedLandingPages = useMemo(() => {
    if (!landingPages) return [];
    return landingPages.filter(landingPage => excludedLpIds.has(landingPage.id));
  }, [landingPages, excludedLpIds]);

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
        const plan = (user?.plan as "free" | "light" | "pro" | "admin") || "free";
        const minIntervalDays = plan === "pro" || plan === "admin" ? 1 : 3;
        if (currentSchedule.intervalDays === minIntervalDays) {
          toast.info(`監視間隔を${currentSchedule.intervalDays}日に自動調整しました（プランに応じた最小間隔）`);
          setHasShownAutoAdjustmentToast(true);
        }
      }
    }
  }, [currentSchedule, user?.plan, hasShownAutoAdjustmentToast, intervalDays]);

  // 入力値変更の有無（ダーティ状態）を判定
  // 最初の設定がない場合は常に保存可能
  const isScheduleDirty = !currentSchedule || 
    (currentSchedule?.intervalDays ?? 3) !== intervalDays ||
    (currentSchedule?.executeHour ?? 9) !== executeHour ||
    (() => {
      // 除外LPの差分チェック
      const currentExcludedIds = currentSchedule?.excludedLandingPageIds
        ? (JSON.parse(currentSchedule.excludedLandingPageIds) as number[])
        : [];
      const currentSet = new Set(currentExcludedIds);
      if (currentSet.size !== excludedLpIds.size) return true;
      for (const id of excludedLpIds) {
        if (!currentSet.has(id)) return true;
      }
      return false;
    })();

  // Creative schedule handlers
  const handleSaveCreativeSchedule = async () => {
    if (creativeIntervalDays < minIntervalDays) {
      toast.error(`監視間隔は${minIntervalDays}日以上である必要があります`);
      return;
    }
    if (creativeIntervalDays < 1) {
      toast.error("監視間隔は1日以上である必要があります");
      return;
    }

    try {
      const result = await upsertCreativeSchedule.mutateAsync({
        intervalDays: creativeIntervalDays,
        executeHour: creativeExecuteHour,
        enabled: true,
        excludedCreativeIds: Array.from(excludedCreativeIds),
      });
      
      if (result.adjustedIntervalDays) {
        toast.success(`監視間隔を${result.adjustedIntervalDays}日に自動調整しました（プランに応じた最小間隔）`);
        setCreativeIntervalDays(result.adjustedIntervalDays);
      } else {
        toast.success("スケジュールを保存しました");
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      refetchCreativeSchedules();
      creativeScheduleQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "保存に失敗しました");
    }
  };

  const handleToggleCreativeSchedule = async (checked: boolean) => {
    try {
      if (checked) {
        await startCreativeSchedule.mutateAsync();
        toast.success("スケジュールを開始しました");
      } else {
        await stopCreativeSchedule.mutateAsync();
        toast.success("スケジュールを一時停止しました");
      }
      refetchCreativeSchedules();
      creativeScheduleQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "操作に失敗しました");
      creativeScheduleQuery.refetch();
    }
  };

  const handleOpenExcludeCreativeDialog = () => {
    setTempExcludedCreativeIds(new Set(excludedCreativeIds));
    setIsExcludeCreativeDialogOpen(true);
  };

  const handleSaveExcludeCreativeDialog = () => {
    setExcludedCreativeIds(new Set(tempExcludedCreativeIds));
    setIsExcludeCreativeDialogOpen(false);
  };

  const handleCancelExcludeCreativeDialog = () => {
    setTempExcludedCreativeIds(new Set(excludedCreativeIds));
    setIsExcludeCreativeDialogOpen(false);
  };

  const filteredCreativesForExclude = useMemo(() => {
    if (!creatives) return [];
    if (!excludeCreativeSearchQuery.trim()) return creatives;
    
    const query = excludeCreativeSearchQuery.toLowerCase();
    return creatives.filter(creative => 
      (creative.title || "無題").toLowerCase().includes(query) ||
      creative.imageUrl.toLowerCase().includes(query)
    );
  }, [creatives, excludeCreativeSearchQuery]);

  const handleDeleteCreativeSchedule = async () => {
    try {
      await deleteCreativeSchedule.mutateAsync();
      toast.success("スケジュールを削除しました");
      refetchCreativeSchedules();
      creativeScheduleQuery.refetch();
    } catch (error) {
      toast.error("削除に失敗しました");
    }
  };

  useEffect(() => {
    if (currentCreativeSchedule) {
      const previousIntervalDays = creativeIntervalDays;
      setCreativeIntervalDays(currentCreativeSchedule.intervalDays);
      setCreativeExecuteHour(currentCreativeSchedule.executeHour ?? 9);
      
      if (previousIntervalDays > 0 && currentCreativeSchedule.intervalDays > previousIntervalDays && !hasShownCreativeAutoAdjustmentToast) {
        const plan = (user?.plan as "free" | "light" | "pro" | "admin") || "free";
        const minIntervalDays = plan === "pro" || plan === "admin" ? 1 : 3;
        if (currentCreativeSchedule.intervalDays === minIntervalDays) {
          toast.info(`監視間隔を${currentCreativeSchedule.intervalDays}日に自動調整しました（プランに応じた最小間隔）`);
          setHasShownCreativeAutoAdjustmentToast(true);
        }
      }
    }
  }, [currentCreativeSchedule, user?.plan, hasShownCreativeAutoAdjustmentToast, creativeIntervalDays]);

  useEffect(() => {
    if (currentCreativeSchedule?.excludedCreativeIds) {
      try {
        const excludedIds = JSON.parse(currentCreativeSchedule.excludedCreativeIds) as number[];
        setExcludedCreativeIds(new Set(excludedIds));
      } catch (error) {
        console.error("Failed to parse excluded creative IDs:", error);
      }
    }
  }, [currentCreativeSchedule?.excludedCreativeIds]);

  // 最初の設定がない場合は常に保存可能
  const isCreativeScheduleDirty = !currentCreativeSchedule ||
    (currentCreativeSchedule?.intervalDays ?? 3) !== creativeIntervalDays ||
    (currentCreativeSchedule?.executeHour ?? 9) !== creativeExecuteHour ||
    (() => {
      const currentExcludedIds = currentCreativeSchedule?.excludedCreativeIds
        ? (JSON.parse(currentCreativeSchedule.excludedCreativeIds) as number[])
        : [];
      const currentSet = new Set(currentExcludedIds);
      if (currentSet.size !== excludedCreativeIds.size) return true;
      for (const id of excludedCreativeIds) {
        if (!currentSet.has(id)) return true;
      }
      return false;
    })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">スケジュール設定</h1>
        <p className="text-muted-foreground mt-2">
          LPとクリエイティブの自動監視スケジュールを設定します
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
                最小監視間隔: {user?.plan === "pro" || user?.plan === "admin" ? "1日" : "3日"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LPセクション */}
      <Card>
        <CardHeader>
          <CardTitle>LP</CardTitle>
          <CardDescription>LPの自動監視スケジュールを設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* スケジュール設定 */}
          <Card>
            <CardHeader>
              <CardTitle>スケジュール設定</CardTitle>
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

            <div className="flex gap-2">
              <Button
                onClick={handleSaveSchedule}
                disabled={upsertSchedule.isPending || !isScheduleDirty}
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

          {/* 現在の設定 */}
          {currentSchedule && (
            <Card>
              <CardHeader>
                <CardTitle>現在の設定</CardTitle>
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
                    {landingPages ? landingPages.length - excludedLpIds.size : 0}件
                    {excludedLpIds.size > 0 && (
                      <span className="text-sm text-muted-foreground ml-1">
                        （全{landingPages?.length || 0}件中、{excludedLpIds.size}件除外）
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
        </CardContent>
      </Card>

      {/* クリエイティブセクション */}
      <Card>
        <CardHeader>
          <CardTitle>クリエイティブ</CardTitle>
          <CardDescription>クリエイティブの自動監視スケジュールを設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* スケジュール設定 */}
          <Card>
            <CardHeader>
              <CardTitle>スケジュール設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="creative-interval-days" className="mb-2 block">監視間隔（日）</Label>
                <Input
                  id="creative-interval-days"
                  type="number"
                  min={minIntervalDays}
                  value={creativeIntervalDays}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= minIntervalDays) {
                      setCreativeIntervalDays(value);
                    }
                  }}
                  placeholder={`${minIntervalDays}日以上`}
                />
                <p className="text-sm text-muted-foreground">
                  {creativeIntervalDays}日ごとに監視します（最小: {minIntervalDays}日）
                </p>
                {creativeIntervalDays < minIntervalDays && (
                  <p className="text-sm text-red-500">
                    {minIntervalDays}日以上である必要があります
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="creative-execute-hour" className="mb-2 block">実行時間帯（時）</Label>
                <Input
                  id="creative-execute-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={creativeExecuteHour}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    if (!isNaN(value) && value >= 0 && value <= 23) {
                      setCreativeExecuteHour(value);
                    }
                  }}
                  placeholder="9"
                />
                <p className="text-sm text-muted-foreground">
                  {creativeExecuteHour}時に実行します（0-23時）
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSaveCreativeSchedule}
                  disabled={upsertCreativeSchedule.isPending || !isCreativeScheduleDirty}
                >
                  {upsertCreativeSchedule.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {currentCreativeSchedule ? "スケジュールを更新" : "スケジュールを保存"}
                </Button>
                {currentCreativeSchedule && (
                  <Button
                    variant="destructive"
                    onClick={handleDeleteCreativeSchedule}
                    disabled={deleteCreativeSchedule.isPending}
                  >
                    {deleteCreativeSchedule.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    削除
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 現在の設定 */}
          {currentCreativeSchedule && (
            <Card>
              <CardHeader>
                <CardTitle>現在の設定</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">監視間隔</p>
                    <p className="text-lg font-semibold">{currentCreativeSchedule.intervalDays}日ごと</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">監視対象</p>
                    <p className="text-lg font-semibold">
                      {creatives ? creatives.length - excludedCreativeIds.size : 0}件
                      {excludedCreativeIds.size > 0 && (
                        <span className="text-sm text-muted-foreground ml-1">
                          （全{creatives?.length || 0}件中、{excludedCreativeIds.size}件除外）
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">最終実行</p>
                    <p className="text-lg font-semibold">
                      {currentCreativeSchedule.lastRunAt
                        ? new Date(currentCreativeSchedule.lastRunAt).toLocaleString("ja-JP", {
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
                      {currentCreativeSchedule.nextRunAt
                        ? new Date(currentCreativeSchedule.nextRunAt).toLocaleString("ja-JP", {
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
                    {creativeEnabled ? (
                      <Play className="w-5 h-5 text-green-500" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                    <span className="font-medium">
                      {creativeEnabled ? "設定中" : "一時停止中"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {creativeEnabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const result = await resetCreativeSchedule.mutateAsync();
                            toast.success(result.message || "スケジュールをリセットしました");
                            refetchCreativeSchedules();
                            creativeScheduleQuery.refetch();
                          } catch (error: any) {
                            toast.error(error.message || "リセットに失敗しました");
                          }
                        }}
                        disabled={resetCreativeSchedule.isPending}
                      >
                        {resetCreativeSchedule.isPending ? (
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
                      checked={creativeEnabled}
                      onCheckedChange={handleToggleCreativeSchedule}
                      disabled={startCreativeSchedule.isPending || stopCreativeSchedule.isPending}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

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
              {filteredLandingPagesForExclude.length > 0 ? (
                <div className="space-y-2">
                  {filteredLandingPagesForExclude.map((landingPage) => (
                    <div key={landingPage.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`temp-exclude-lp-${landingPage.id}`}
                        checked={tempExcludedLpIds.has(landingPage.id)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(tempExcludedLpIds);
                          if (checked) {
                            newSet.add(landingPage.id);
                          } else {
                            newSet.delete(landingPage.id);
                          }
                          setTempExcludedLpIds(newSet);
                        }}
                      />
                      <Label
                        htmlFor={`temp-exclude-lp-${landingPage.id}`}
                        className="cursor-pointer flex-1"
                      >
                        <p className="text-sm font-medium">{landingPage.title || "無題"}</p>
                        <p className="text-xs text-muted-foreground truncate">{landingPage.url}</p>
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

      {/* 除外クリエイティブ編集ダイアログ */}
      <Dialog open={isExcludeCreativeDialogOpen} onOpenChange={setIsExcludeCreativeDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>除外クリエイティブを設定</DialogTitle>
            <DialogDescription>
              自動監視の対象外にしたいクリエイティブを選択してください
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* 検索バー */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="クリエイティブを検索..."
                value={excludeCreativeSearchQuery}
                onChange={(e) => setExcludeCreativeSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* クリエイティブリスト */}
            <div className="border rounded-md p-4 flex-1 overflow-y-auto">
              {filteredCreativesForExclude.length > 0 ? (
                <div className="space-y-2">
                  {filteredCreativesForExclude.map((creative) => (
                    <div key={creative.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`temp-exclude-creative-${creative.id}`}
                        checked={tempExcludedCreativeIds.has(creative.id)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(tempExcludedCreativeIds);
                          if (checked) {
                            newSet.add(creative.id);
                          } else {
                            newSet.delete(creative.id);
                          }
                          setTempExcludedCreativeIds(newSet);
                        }}
                      />
                      <Label
                        htmlFor={`temp-exclude-creative-${creative.id}`}
                        className="cursor-pointer flex-1"
                      >
                        <p className="text-sm font-medium">{creative.title || "無題"}</p>
                        <p className="text-xs text-muted-foreground truncate">{creative.imageUrl}</p>
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {excludeCreativeSearchQuery ? "検索結果がありません" : "クリエイティブが登録されていません"}
                </p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {tempExcludedCreativeIds.size}件のクリエイティブを除外中
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelExcludeCreativeDialog}
            >
              キャンセル
            </Button>
            <Button onClick={handleSaveExcludeCreativeDialog}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
