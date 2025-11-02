import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { useState } from "react";

export default function MonitoringHistory() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/history/:id");
  const landingPageId = params?.id ? parseInt(params.id) : 0;

  const [selectedHistory, setSelectedHistory] = useState<any>(null);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);

  const { data: history, isLoading } = trpc.monitoring.history.useQuery(
    { landingPageId },
    { enabled: landingPageId > 0 }
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ok":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "changed":
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ok":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">正常</Badge>;
      case "changed":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">変更検出</Badge>;
      case "error":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">エラー</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCheckTypeBadge = (checkType: string) => {
    switch (checkType) {
      case "content_change":
        return <Badge variant="secondary">コンテンツ変更</Badge>;
      case "link_broken":
        return <Badge variant="secondary">リンク切れ</Badge>;
      default:
        return <Badge variant="secondary">{checkType}</Badge>;
    }
  };

  const handleViewImages = (historyItem: any) => {
    setSelectedHistory(historyItem);
    setIsImageDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="mb-4">
        <Button variant="ghost" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          LPリストに戻る
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">監視履歴</CardTitle>
          <CardDescription>このLPの変更検出とリンク切れチェックの履歴</CardDescription>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>監視履歴がありません</p>
              <p className="text-sm mt-2">LPリストから「チェック」を実行してください</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>チェック日時</TableHead>
                  <TableHead>種類</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>メッセージ</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {new Date(item.createdAt).toLocaleString("ja-JP")}
                    </TableCell>
                    <TableCell>{getCheckTypeBadge(item.checkType)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.status)}
                        {getStatusBadge(item.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {item.message}
                        {item.regionAnalysis && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.regionAnalysis}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {item.screenshotUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewImages(item)}
                        >
                          画像を表示
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>スクリーンショット比較</DialogTitle>
          </DialogHeader>
          {selectedHistory && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">現在のスクリーンショット</h3>
                <img
                  src={selectedHistory.screenshotUrl}
                  alt="Current screenshot"
                  className="w-full border rounded"
                />
              </div>
              {selectedHistory.previousScreenshotUrl && (
                <div>
                  <h3 className="font-semibold mb-2">前回のスクリーンショット</h3>
                  <img
                    src={selectedHistory.previousScreenshotUrl}
                    alt="Previous screenshot"
                    className="w-full border rounded"
                  />
                </div>
              )}
              {selectedHistory.diffImageUrl && (
                <div>
                  <h3 className="font-semibold mb-2">差分画像</h3>
                  {selectedHistory.regionAnalysis && (
                    <div className="mb-2 p-3 bg-muted rounded">
                      <p className="text-sm font-medium">領域別分析:</p>
                      <p className="text-sm">{selectedHistory.regionAnalysis}</p>
                      {selectedHistory.diffTopThird && (
                        <div className="text-xs mt-2 space-y-1">
                          <div>上部(ファーストビュー): {selectedHistory.diffTopThird}%</div>
                          <div>中部: {selectedHistory.diffMiddleThird}%</div>
                          <div>下部: {selectedHistory.diffBottomThird}%</div>
                        </div>
                      )}
                    </div>
                  )}
                  <img
                    src={selectedHistory.diffImageUrl}
                    alt="Diff image"
                    className="w-full border rounded"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
