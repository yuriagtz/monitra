import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Clock,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import { PLAN_CONFIG } from "@/_core/plan";

export default function Dashboard() {
  const { user } = useAuth();

  const userPlanKey = (user?.plan as "free" | "light" | "pro" | "admin") || "free";
  const planInfo = PLAN_CONFIG[userPlanKey];

  const { data: landingPages, isLoading: lpLoading } = trpc.landingPages.list.useQuery(undefined, {
    staleTime: 1000 * 60 * 10, // 10分間キャッシュ
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const { data: recentHistory } = trpc.monitoring.recent.useQuery(
    { limit: 10 },
    {
      staleTime: 0, // キャッシュを使わずに常に最新を取得
      refetchOnWindowFocus: true, // ウィンドウフォーカス時に再取得
      refetchOnMount: true, // マウント時に再取得
      refetchInterval: 30000, // 30秒ごとに自動更新
    }
  );

  // クリエイティブ
  const { data: creatives, isLoading: creativesLoading } =
    trpc.creatives.list.useQuery(undefined, {
      staleTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });
  const { data: recentCreativeHistory } =
    trpc.monitoring.creativeRecent.useQuery(
      { limit: 10 },
      {
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchInterval: 30000,
      }
    );

  // スケジュール（概況表示用）
  const { data: lpSchedule } = trpc.schedules.get.useQuery();
  // TODO: creativeSchedules routerが実装されたら有効化
  // const { data: creativeSchedule } = trpc.creativeSchedules.get.useQuery();
  const creativeSchedule = null;

  // 統計情報の計算
  const totalLPs = landingPages?.length || 0;
  const totalCreatives = creatives?.length || 0;

  // 使用率の計算
  const lpUsagePercent = planInfo.maxLpCount === null 
    ? 0 
    : Math.round((totalLPs / planInfo.maxLpCount) * 100);
  const creativeUsagePercent = planInfo.maxCreativeCount === null
    ? 0
    : Math.round((totalCreatives / planInfo.maxCreativeCount) * 100);
  
  const lpIsOverLimit = planInfo.maxLpCount !== null && totalLPs > planInfo.maxLpCount;
  const creativeIsOverLimit = planInfo.maxCreativeCount !== null && totalCreatives > planInfo.maxCreativeCount;

  const recentChanges =
    recentHistory?.filter((h) => h.status === "changed").length || 0;
  const recentErrors =
    recentHistory?.filter((h) => h.status === "error").length || 0;
  const recentOk =
    recentHistory?.filter((h) => h.status === "ok").length || 0;

  const recentCreativeChanges =
    recentCreativeHistory?.filter((h: any) => h.status === "changed").length ||
    0;
  const recentCreativeErrors =
    recentCreativeHistory?.filter((h: any) => h.status === "error").length ||
    0;
  const recentCreativeOk =
    recentCreativeHistory?.filter((h: any) => h.status === "ok").length || 0;

  // 今日・今週の実行サマリー（LP）
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * oneDayMs;

  const lpToday = {
    checks:
      recentHistory?.filter(
        (h) => now.getTime() - new Date(h.createdAt).getTime() <= oneDayMs
      ).length || 0,
    changes:
      recentHistory?.filter(
        (h) =>
          h.status === "changed" &&
          now.getTime() - new Date(h.createdAt).getTime() <= oneDayMs
      ).length || 0,
    errors:
      recentHistory?.filter(
        (h) =>
          h.status === "error" &&
          now.getTime() - new Date(h.createdAt).getTime() <= oneDayMs
      ).length || 0,
  };

  const lpThisWeek = {
    checks:
      recentHistory?.filter(
        (h) => now.getTime() - new Date(h.createdAt).getTime() <= sevenDaysMs
      ).length || 0,
    changes:
      recentHistory?.filter(
        (h) =>
          h.status === "changed" &&
          now.getTime() - new Date(h.createdAt).getTime() <= sevenDaysMs
      ).length || 0,
    errors:
      recentHistory?.filter(
        (h) =>
          h.status === "error" &&
          now.getTime() - new Date(h.createdAt).getTime() <= sevenDaysMs
      ).length || 0,
  };

  // 今日・今週の実行サマリー（クリエイティブ）
  const creativeToday = {
    checks:
      recentCreativeHistory?.filter(
        (h: any) =>
          now.getTime() -
            new Date(h.createdAt ?? h.created_at).getTime() <=
          oneDayMs
      ).length || 0,
    changes:
      recentCreativeHistory?.filter(
        (h: any) =>
          h.status === "changed" &&
          now.getTime() -
            new Date(h.createdAt ?? h.created_at).getTime() <=
            oneDayMs
      ).length || 0,
    errors:
      recentCreativeHistory?.filter(
        (h: any) =>
          h.status === "error" &&
          now.getTime() -
            new Date(h.createdAt ?? h.created_at).getTime() <=
            oneDayMs
      ).length || 0,
  };

  const creativeThisWeek = {
    checks:
      recentCreativeHistory?.filter(
        (h: any) =>
          now.getTime() -
            new Date(h.createdAt ?? h.created_at).getTime() <=
          sevenDaysMs
      ).length || 0,
    changes:
      recentCreativeHistory?.filter(
        (h: any) =>
          h.status === "changed" &&
          now.getTime() -
            new Date(h.createdAt ?? h.created_at).getTime() <=
            sevenDaysMs
      ).length || 0,
    errors:
      recentCreativeHistory?.filter(
        (h: any) =>
          h.status === "error" &&
          now.getTime() -
            new Date(h.createdAt ?? h.created_at).getTime() <=
            sevenDaysMs
      ).length || 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">ダッシュボード</h1>
          <p className="text-muted-foreground mt-2">
            LPとクリエイティブの監視状況や最近の結果を一覧します
          </p>
        </div>
      </div>

      {/* 現在のプラン（LP/クリエイティブ共通のサマリー） */}
      <div>
        <Card className="bg-gradient-to-br from-emerald-50/90 via-green-50/80 to-emerald-100/90 hover:shadow-md transition-all duration-300 border border-emerald-200/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-emerald-900">現在のプラン</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between gap-6">
              {/* プラン名と最小監視間隔（左側） */}
              <div>
                <div className="text-2xl font-bold text-emerald-900">{planInfo.name}</div>
                <div className="text-sm text-emerald-700/85 mt-1">
                  最小監視間隔: {planInfo.minIntervalDays}日ごと
                </div>
              </div>

              {/* 使用状況（右側） */}
              <div className="flex items-start gap-6">
                {/* LP使用状況 */}
                <div className="space-y-2 min-w-[220px]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-emerald-700/85 font-medium">監視対象LP</div>
                    <div className="flex items-center gap-1">
                      {lpIsOverLimit && (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      )}
                      <div className={`font-semibold text-base ${lpIsOverLimit ? 'text-red-600' : 'text-emerald-900'}`}>
                        {planInfo.maxLpCount === null
                          ? "無制限"
                          : `${totalLPs} / ${planInfo.maxLpCount}`}
                      </div>
                    </div>
                  </div>
                  {planInfo.maxLpCount !== null && (
                    <>
                      <div className="text-xs text-emerald-700/80 text-right">
                        ({lpUsagePercent}%)
                      </div>
                      <div className="relative">
                        <Progress 
                          value={Math.min(100, lpUsagePercent)} 
                          className={`h-2 ${lpIsOverLimit ? '[&>div>div]:bg-red-500' : ''}`}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* クリエイティブ使用状況 */}
                <div className="space-y-2 min-w-[220px]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-emerald-700/85 font-medium">監視対象クリエイティブ</div>
                    <div className="flex items-center gap-1">
                      {creativeIsOverLimit && (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      )}
                      <div className={`font-semibold text-base ${creativeIsOverLimit ? 'text-red-600' : 'text-emerald-900'}`}>
                        {planInfo.maxCreativeCount === null
                          ? "無制限"
                          : `${totalCreatives} / ${planInfo.maxCreativeCount}`}
                      </div>
                    </div>
                  </div>
                  {planInfo.maxCreativeCount !== null && (
                    <>
                      <div className="text-xs text-emerald-700/80 text-right">
                        ({creativeUsagePercent}%)
                      </div>
                      <div className="relative">
                        <Progress 
                          value={Math.min(100, creativeUsagePercent)} 
                          className={`h-2 ${creativeIsOverLimit ? '[&>div>div]:bg-red-500' : ''}`}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* LPセクション */}
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>LPのサマリー</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 今日・今週の監視状況（LP）- 一番上に配置 */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="bg-gradient-to-br from-slate-100 via-gray-100 to-slate-200/90 hover:shadow-lg transition-all duration-300 border-2 border-slate-300/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    今日の監視状況
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-600/90 mb-3">
                    本日実行された監視結果のサマリーです
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">チェック回数:</span>
                      <span className="font-bold text-slate-900">{lpToday.checks}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">変更検出:</span>
                      <span className="font-bold text-amber-600">{lpToday.changes}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">エラー:</span>
                      <span className="font-bold text-red-600">
                        {lpToday.errors}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-slate-100 via-gray-100 to-slate-200/90 hover:shadow-lg transition-all duration-300 border-2 border-slate-300/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    今週の監視状況
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-600/90 mb-3">
                    過去7日間の監視結果のサマリーです
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">チェック回数:</span>
                      <span className="font-bold text-slate-900">{lpThisWeek.checks}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">変更検出:</span>
                      <span className="font-bold text-amber-600">{lpThisWeek.changes}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">エラー:</span>
                      <span className="font-bold text-red-600">
                        {lpThisWeek.errors}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* LPサマリー */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 hover:shadow-lg transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    登録数
                  </CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalLPs}</div>
                  <p className="text-xs text-muted-foreground">
                    監視対象のLP
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-green-50 to-emerald-100/50 hover:shadow-lg transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">正常</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{recentOk}</div>
                  <p className="text-xs text-muted-foreground">
                    最近の正常チェック
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-orange-50 to-amber-100/50 hover:shadow-lg transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    変更検出
                  </CardTitle>
                  <Activity className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{recentChanges}</div>
                  <p className="text-xs text-muted-foreground">
                    最近の変更検出
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-50 to-rose-100/50 hover:shadow-lg transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">エラー</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{recentErrors}</div>
                  <p className="text-xs text-muted-foreground">
                    最近のエラー
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 自動監視スケジュール（LP）- 目立つように配置 */}
            <div className="rounded-lg border-2 border-blue-300/70 bg-gradient-to-r from-blue-50 via-blue-100/80 to-blue-50 px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-700" />
                  <span className="font-bold text-base text-blue-900">
                    自動監視スケジュール
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-blue-800">
                    {lpSchedule && 'enabled' in lpSchedule && 'intervalDays' in lpSchedule ? (
                      <>
                        {lpSchedule.enabled ? (
                          <span className="text-green-700">● 有効</span>
                        ) : (
                          <span className="text-gray-600">○ 無効</span>
                        )}
                        {" ・ "}
                        {lpSchedule.intervalDays}日ごと / 実行時刻: {lpSchedule.executeHour ?? 9}時台
                        {lpSchedule.enabled && 'nextRunAt' in lpSchedule && lpSchedule.nextRunAt && typeof lpSchedule.nextRunAt !== 'undefined' && lpSchedule.nextRunAt !== null && (
                          <>
                            <br />
                            <span className="text-xs text-blue-700 mt-1 block">
                              次回実行: {new Date(lpSchedule.nextRunAt as string | Date).toLocaleString("ja-JP", {
                                year: "numeric",
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-700">未設定です。スケジュール管理画面で設定してください。</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* 最近の監視履歴 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">最近の監視履歴</CardTitle>
              </CardHeader>
              <CardContent>
                {!recentHistory || recentHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    まだ監視履歴がありません
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentHistory.map((history) => {
                      const lp = landingPages?.find(
                        (l) => l.id === history.landingPageId
                      );
                      return (
                        <div
                          key={history.id}
                          className="flex items-center justify-between border-b pb-2 last:border-0"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {lp?.title || "未設定"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(
                                history.createdAt
                              ).toLocaleString("ja-JP")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {history.status === "ok" && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                正常
                              </span>
                            )}
                            {history.status === "changed" && (
                              <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                                変更検出
                              </span>
                            )}
                            {history.status === "error" && (
                              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                                エラー
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {history.message}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </section>

      {/* クリエイティブセクション */}
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>クリエイティブのサマリー</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 今日・今週の監視状況（クリエイティブ）- 一番上に配置 */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="bg-gradient-to-br from-slate-100 via-gray-100 to-slate-200/90 hover:shadow-lg transition-all duration-300 border-2 border-slate-300/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    今日の監視状況
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-600/90 mb-3">
                    本日実行された監視結果のサマリーです
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">チェック回数:</span>
                      <span className="font-bold text-slate-900">{creativeToday.checks}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">変更検出:</span>
                      <span className="font-bold text-amber-600">{creativeToday.changes}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">エラー:</span>
                      <span className="font-bold text-red-600">
                        {creativeToday.errors}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-slate-100 via-gray-100 to-slate-200/90 hover:shadow-lg transition-all duration-300 border-2 border-slate-300/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-slate-900">
                    今週の監視状況
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-slate-600/90 mb-3">
                    過去7日間の監視結果のサマリーです
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">チェック回数:</span>
                      <span className="font-bold text-slate-900">{creativeThisWeek.checks}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">変更検出:</span>
                      <span className="font-bold text-amber-600">{creativeThisWeek.changes}</span>
                    </p>
                    <p className="text-sm flex items-center justify-between">
                      <span className="text-muted-foreground">エラー:</span>
                      <span className="font-bold text-red-600">
                        {creativeThisWeek.errors}
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* クリエイティブサマリー */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 hover:shadow-lg transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    登録数
                  </CardTitle>
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalCreatives}</div>
                  <p className="text-xs text-muted-foreground">
                    監視対象のクリエイティブ
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 hover:shadow-lg transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    正常
                  </CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{recentCreativeOk}</div>
                  <p className="text-xs text-muted-foreground">
                    最近の正常チェック
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 hover:shadow-lg transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    変更検出
                  </CardTitle>
                  <Activity className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{recentCreativeChanges}</div>
                  <p className="text-xs text-muted-foreground">
                    最近の変更検出
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-rose-50 to-rose-100/50 hover:shadow-lg transition-all duration-300">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    エラー
                  </CardTitle>
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {recentCreativeErrors}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    最近のエラー
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 自動監視スケジュール（クリエイティブ）- 目立つように配置 */}
            <div className="rounded-lg border-2 border-purple-300/70 bg-gradient-to-r from-purple-50 via-purple-100/80 to-purple-50 px-4 py-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-purple-700" />
                  <span className="font-bold text-base text-purple-900">
                    自動監視スケジュール
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-purple-800">
                    <span className="text-amber-700">未設定です。スケジュール管理画面で設定してください。</span>
                  </span>
                </div>
              </div>
            </div>

            {/* 最近の監視履歴 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">最近の監視履歴</CardTitle>
              </CardHeader>
              <CardContent>
                {!recentCreativeHistory ||
                recentCreativeHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    まだ監視履歴がありません
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recentCreativeHistory.map((history: any) => {
                      const creative = creatives?.find(
                        (c) => c.id === history.creativeId
                      );
                      return (
                        <div
                          key={history.id}
                          className="flex items-center justify-between border-b pb-2 last:border-0"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {creative?.title || "未設定"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(
                                history.createdAt ?? history.created_at
                              ).toLocaleString("ja-JP")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {history.status === "ok" && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                正常
                              </span>
                            )}
                            {history.status === "changed" && (
                              <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                                変更検出
                              </span>
                            )}
                            {history.status === "error" && (
                              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                                エラー
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {history.message}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
