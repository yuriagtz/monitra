import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ArrowLeft, CalendarIcon } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { useState } from "react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

export default function CreativeHistory() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/history/creative/:id");
  const creativeId = params?.id ? parseInt(params.id) : 0;

  const [selectedHistory, setSelectedHistory] = useState<any>(null);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const { data: allHistory, isLoading } = trpc.creatives.history.useQuery(
    { creativeId },
    {
      enabled: creativeId > 0,
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    }
  );

  const { data: creatives } = trpc.creatives.list.useQuery(undefined, {
    // パフォーマンス最適化: キャッシュ時間を延長
    staleTime: 1000 * 60 * 10,
    cacheTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // クリエイティブ情報を取得
  const creative = creatives?.find((c) => c.id === creativeId);

  // フィルタリング処理
  const history = allHistory?.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (typeFilter !== "all" && item.checkType !== typeFilter) return false;
    if (startDate && new Date(item.createdAt) < startDate) return false;
    if (endDate && new Date(item.createdAt) > endDate) return false;
    return true;
  });

  const getStatusBadge = (status: string, checkType?: string) => {
    // LP管理の一覧画面と同じ表記にする
    if (status === "ok") {
      return (
        <Badge
          variant="outline"
          className="bg-green-50 text-green-700 border-green-200"
        >
          変更なし
        </Badge>
      );
    } else if (status === "changed") {
      return (
        <Badge
          variant="outline"
          className="bg-yellow-50 text-yellow-700 border-yellow-200"
        >
          変更検出
        </Badge>
      );
    } else if (status === "error" && checkType === "link_broken") {
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200"
        >
          リンク切れ
        </Badge>
      );
    } else if (status === "error") {
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200"
        >
          エラー
        </Badge>
      );
    } else {
      return <Badge variant="outline">未監視</Badge>;
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
        <Button variant="ghost" onClick={() => setLocation("/creatives")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          クリエイティブ一覧に戻る
        </Button>
      </div>

      {/* フィルターセクション */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>フィルター</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">ステータス</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="ok">正常</SelectItem>
                  <SelectItem value="changed">変更検出</SelectItem>
                  <SelectItem value="error">エラー</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">変更タイプ</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべて</SelectItem>
                  <SelectItem value="content_change">コンテンツ変更</SelectItem>
                  <SelectItem value="link_broken">リンク切れ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">開始日</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP", { locale: ja }) : "選択してください"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ja} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">終了日</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP", { locale: ja }) : "選択してください"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ja} />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">監視履歴</CardTitle>
          <CardDescription>
            このクリエイティブの変更検出とリンク切れチェックの履歴
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!history || history.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>監視履歴がありません</p>
              <p className="text-sm mt-2">
                クリエイティブ一覧から「監視」を実行してください
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-center">チェック日時</TableHead>
                  <TableHead className="text-center">変更タイプ</TableHead>
                  <TableHead className="text-center">ステータス</TableHead>
                  <TableHead className="text-center">メッセージ</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow
                    key={item.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="text-center">
                      {new Date(item.createdAt).toLocaleString("ja-JP")}
                    </TableCell>
                    <TableCell className="text-center">
                      {getCheckTypeBadge(item.checkType)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {getStatusBadge(item.status, item.checkType)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.message}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewImages(item)}
                        disabled={!item.screenshotUrl}
                      >
                        画像を表示
                      </Button>
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
            <DialogTitle>画像比較</DialogTitle>
          </DialogHeader>
          {selectedHistory && selectedHistory.screenshotUrl ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">現在の画像</h3>
                <img
                  src={selectedHistory.screenshotUrl}
                  alt="Current image"
                  className="w-full border rounded"
                />
              </div>
              {selectedHistory.previousScreenshotUrl && (
                <div>
                  <h3 className="font-semibold mb-2">前回の画像（前回変更時）</h3>
                  <img
                    src={selectedHistory.previousScreenshotUrl}
                    alt="Previous image"
                    className="w-full border rounded"
                  />
                </div>
              )}
              {selectedHistory.regionAnalysis && (
                <div className="p-3 bg-muted rounded">
                  <p className="text-sm font-medium">画像ハッシュ:</p>
                  <p className="text-sm font-mono">{selectedHistory.regionAnalysis}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>この監視履歴には画像が保存されていません</p>
              <p className="text-sm mt-2">変更が検出されなかったため、画像は保存されませんでした</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
