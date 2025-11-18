import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";

export default function ImportExport() {
  const utils = trpc.useUtils();
  const { data: landingPages } = trpc.landingPages.list.useQuery();
  const { data: creatives } = trpc.creatives.list.useQuery();
  const { data: histories } = trpc.monitoring.recent.useQuery({ limit: 1000 });
  const { data: creativeHistories } = trpc.monitoring.creativeRecent.useQuery({ limit: 1000 });
  const { data: exportHistory = [], isLoading: isHistoryLoading } = trpc.importExport.getHistory.useQuery(
    undefined,
    { staleTime: 1000 * 60 }
  );
  const recordExport = trpc.importExport.recordExport.useMutation({
    onSuccess: () => utils.importExport.getHistory.invalidate(),
  });
  
  const handleExportLps = async () => {
    if (!landingPages || landingPages.length === 0) {
      toast.error('エクスポートするLPがありません');
      return;
    }
    
    const csv = [
      'Title,URL,Description',
      ...landingPages.map(landingPage => `"${landingPage.title}","${landingPage.url}","${landingPage.description || ''}"`)
    ].join('\n');
    
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const filename = `lps_${new Date().toISOString().split('T')[0]}.csv`;
    link.download = filename;
    link.click();
    
    await recordExport.mutateAsync({ type: "LPリスト (CSV)", filename });
    toast.success('LPリストをエクスポートしました');
  };
  
  const handleExportHistories = async () => {
    if (!histories || histories.length === 0) {
      toast.error('エクスポートする履歴がありません');
      return;
    }
    
    const csv = [
      'LP ID,Check Type,Status,Message,Region Analysis,Created At',
      ...histories.map(h => 
        `${h.landingPageId},"${h.checkType}","${h.status}","${h.message || ""}","${h.regionAnalysis || ''}","${new Date(h.createdAt).toISOString()}"`
      )
    ].join('\n');
    
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const filename = `lp_monitoring_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.download = filename;
    link.click();
    
    await recordExport.mutateAsync({ type: "LP監視履歴 (CSV)", filename });
    toast.success('LP監視履歴をエクスポートしました');
  };
  
  const handleExportCreatives = async () => {
    if (!creatives || creatives.length === 0) {
      toast.error('エクスポートするクリエイティブがありません');
      return;
    }
    
    const csv = [
      'Title,Image URL,Target URL,Description',
      ...creatives.map(creative => 
        `"${creative.title}","${creative.imageUrl}","${creative.targetUrl || ''}","${creative.description || ''}"`
      )
    ].join('\n');
    
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const filename = `creatives_${new Date().toISOString().split('T')[0]}.csv`;
    link.download = filename;
    link.click();
    
    await recordExport.mutateAsync({ type: "クリエイティブリスト (CSV)", filename });
    toast.success('クリエイティブリストをエクスポートしました');
  };
  
  const handleExportCreativeHistories = async () => {
    if (!creativeHistories || creativeHistories.length === 0) {
      toast.error('エクスポートする履歴がありません');
      return;
    }
    
    const csv = [
      'Creative ID,Check Type,Status,Message,Region Analysis,Created At',
      ...creativeHistories.map(h => 
        `${h.creativeId},"${h.checkType}","${h.status}","${h.message || ""}","${h.regionAnalysis || ''}","${new Date(h.createdAt).toISOString()}"`
      )
    ].join('\n');
    
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const filename = `creative_monitoring_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.download = filename;
    link.click();
    
    await recordExport.mutateAsync({ type: "クリエイティブ監視履歴 (CSV)", filename });
    toast.success('クリエイティブ監視履歴をエクスポートしました');
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">エクスポート</h1>
        <p className="text-muted-foreground mt-2">
          LP、クリエイティブ、監視履歴のデータをエクスポートしてバックアップを作成します
        </p>
      </div>

      {/* Export */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Download className="w-5 h-5" />
            <div>
              <CardTitle>エクスポート</CardTitle>
              <CardDescription>データをファイルにエクスポート</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* LPセクション */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">LP</h3>
            <div className="space-y-3 pl-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">LPリスト (CSV)</p>
                  <p className="text-sm text-muted-foreground">
                    登録されている全LPをCSV形式でエクスポート
                  </p>
                </div>
                <Button onClick={handleExportLps}>
                  <FileDown className="w-4 h-4 mr-2" />
                  エクスポート
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">LP監視履歴 (CSV)</p>
                  <p className="text-sm text-muted-foreground">
                    全てのLP監視履歴をCSV形式でエクスポート
                  </p>
                </div>
                <Button onClick={handleExportHistories}>
                  <FileDown className="w-4 h-4 mr-2" />
                  エクスポート
                </Button>
              </div>
            </div>
          </div>

          {/* クリエイティブセクション */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">クリエイティブ</h3>
            <div className="space-y-3 pl-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">クリエイティブリスト (CSV)</p>
                  <p className="text-sm text-muted-foreground">
                    登録されている全クリエイティブをCSV形式でエクスポート
                  </p>
                </div>
                <Button onClick={handleExportCreatives}>
                  <FileDown className="w-4 h-4 mr-2" />
                  エクスポート
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">クリエイティブ監視履歴 (CSV)</p>
                  <p className="text-sm text-muted-foreground">
                    全てのクリエイティブ監視履歴をCSV形式でエクスポート
                  </p>
                </div>
                <Button onClick={handleExportCreativeHistories}>
                  <FileDown className="w-4 h-4 mr-2" />
                  エクスポート
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export History */}
      <Card>
        <CardHeader>
          <CardTitle>エクスポート履歴</CardTitle>
          <CardDescription>直近20件のエクスポート記録</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isHistoryLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : exportHistory.length > 0 ? (
            exportHistory.map(entry => (
              <div
                key={entry.id}
                className="flex flex-col gap-1 rounded-lg border p-3 md:flex-row md:items-center md:justify-between bg-amber-50"
              >
                <div>
                  <p className="font-medium">{entry.type}</p>
                  <p className="text-xs text-muted-foreground break-all">{entry.filename}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">エクスポート履歴がまだありません。</p>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle>データ統計</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">登録LP数</p>
              <p className="text-2xl font-bold">{landingPages?.length || 0}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">登録クリエイティブ数</p>
              <p className="text-2xl font-bold">{creatives?.length || 0}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">LP監視履歴数</p>
              <p className="text-2xl font-bold">{histories?.length || 0}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">クリエイティブ監視履歴数</p>
              <p className="text-2xl font-bold">{creativeHistories?.length || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
