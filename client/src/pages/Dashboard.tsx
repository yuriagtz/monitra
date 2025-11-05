import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Activity, AlertTriangle, CheckCircle2, FileText } from "lucide-react";

export default function Dashboard() {
  const { data: landingPages, isLoading: lpLoading } = trpc.lp.list.useQuery(undefined, {
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

  // 統計情報の計算
  const totalLPs = landingPages?.length || 0;
  const recentChanges = recentHistory?.filter(h => h.status === 'changed').length || 0;
  const recentErrors = recentHistory?.filter(h => h.status === 'error').length || 0;
  const recentOk = recentHistory?.filter(h => h.status === 'ok').length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ダッシュボード</h1>
        <p className="text-muted-foreground mt-2">
          Monitraの概要を表示します
        </p>
      </div>

      {/* サマリーカード */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 hover:shadow-lg transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">登録LP数</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLPs}</div>
            <p className="text-xs text-muted-foreground">
              監視中のランディングページ
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
            <CardTitle className="text-sm font-medium">変更検出</CardTitle>
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

      {/* 最近の監視履歴 */}
      <Card>
        <CardHeader>
          <CardTitle>最近の監視履歴</CardTitle>
          <CardDescription>
            直近10件の監視結果を表示しています
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!recentHistory || recentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだ監視履歴がありません</p>
          ) : (
            <div className="space-y-2">
              {recentHistory.map((history) => {
                const lp = landingPages?.find(l => l.id === history.landingPageId);
                return (
                  <div
                    key={history.id}
                    className="flex items-center justify-between border-b pb-2 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{lp?.title || '未設定'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(history.createdAt).toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {history.status === 'ok' && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                          正常
                        </span>
                      )}
                      {history.status === 'changed' && (
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                          変更検出
                        </span>
                      )}
                      {history.status === 'error' && (
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
    </div>
  );
}
