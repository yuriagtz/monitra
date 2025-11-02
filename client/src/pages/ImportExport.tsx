import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Download, FileDown, FileUp, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export default function ImportExport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  
  const { data: lps } = trpc.lp.list.useQuery();
  const { data: histories } = trpc.monitoring.recent.useQuery({ limit: 1000 });
  const importLps = trpc.importExport.importLps.useMutation();
  
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header if exists
      const dataLines = lines[0].toLowerCase().includes('title') ? lines.slice(1) : lines;
      
      const lpsToImport = dataLines.map(line => {
        const [title, url, description] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        return { title, url, description: description || '' };
      }).filter(lp => lp.title && lp.url);
      
      await importLps.mutateAsync({ lps: lpsToImport });
      toast.success(`${lpsToImport.length}件のLPをインポートしました`);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      toast.error('インポートに失敗しました');
      console.error(error);
    } finally {
      setImporting(false);
    }
  };
  
  const handleExportLps = () => {
    if (!lps || lps.length === 0) {
      toast.error('エクスポートするLPがありません');
      return;
    }
    
    const csv = [
      'Title,URL,Description',
      ...lps.map(lp => `"${lp.title}","${lp.url}","${lp.description || ''}"`)
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lps_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast.success('LPリストをエクスポートしました');
  };
  
  const handleExportHistories = () => {
    if (!histories || histories.length === 0) {
      toast.error('エクスポートする履歴がありません');
      return;
    }
    
    const csv = [
      'LP ID,Check Type,Status,Message,Diff %,Top Third %,Middle Third %,Bottom Third %,Region Analysis,Created At',
      ...histories.map(h => 
        `${h.landingPageId},"${h.checkType}","${h.status}","${h.message}",${h.diffTopThird || ''},${h.diffTopThird || ''},${h.diffMiddleThird || ''},${h.diffBottomThird || ''},"${h.regionAnalysis || ''}","${new Date(h.createdAt).toISOString()}"`
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `monitoring_history_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast.success('監視履歴をエクスポートしました');
  };
  
  const handleExportJson = () => {
    if (!lps || lps.length === 0) {
      toast.error('エクスポートするデータがありません');
      return;
    }
    
    const data = {
      exportedAt: new Date().toISOString(),
      lps: lps,
      histories: histories || [],
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lp_monitor_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    toast.success('データをJSONでエクスポートしました');
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">インポート/エクスポート</h1>
        <p className="text-muted-foreground mt-2">
          LPデータと監視履歴のインポート・エクスポート
        </p>
      </div>

      {/* Import */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5" />
            <div>
              <CardTitle>インポート</CardTitle>
              <CardDescription>CSV形式でLPを一括登録</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>CSVファイル</Label>
            <div className="flex gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <Button onClick={handleImportClick} disabled={importing}>
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    インポート中...
                  </>
                ) : (
                  <>
                    <FileUp className="w-4 h-4 mr-2" />
                    CSVファイルを選択
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              CSV形式: Title,URL,Description
            </p>
          </div>

          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm font-medium mb-2">CSVフォーマット例:</p>
            <pre className="text-xs bg-background p-2 rounded">
{`Title,URL,Description
"商品A LP","https://example.com/lp1","商品Aのランディングページ"
"キャンペーン LP","https://example.com/campaign","期間限定キャンペーン"`}
            </pre>
          </div>
        </CardContent>
      </Card>

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
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">LPリスト (CSV)</p>
              <p className="text-sm text-muted-foreground">
                登録されている全LPをCSV形式でエクスポート
              </p>
            </div>
            <Button onClick={handleExportLps} variant="outline">
              <FileDown className="w-4 h-4 mr-2" />
              エクスポート
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">監視履歴 (CSV)</p>
              <p className="text-sm text-muted-foreground">
                全ての監視履歴をCSV形式でエクスポート
              </p>
            </div>
            <Button onClick={handleExportHistories} variant="outline">
              <FileDown className="w-4 h-4 mr-2" />
              エクスポート
            </Button>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">完全バックアップ (JSON)</p>
              <p className="text-sm text-muted-foreground">
                LP・履歴を含む全データをJSON形式でエクスポート
              </p>
            </div>
            <Button onClick={handleExportJson} variant="outline">
              <FileDown className="w-4 h-4 mr-2" />
              エクスポート
            </Button>
          </div>
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
              <p className="text-2xl font-bold">{lps?.length || 0}</p>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">監視履歴数</p>
              <p className="text-2xl font-bold">{histories?.length || 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
