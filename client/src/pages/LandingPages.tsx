import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Eye, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";

export default function LandingPages() {
  const [, setLocation] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const utils = trpc.useUtils();
  const { data: landingPages, isLoading } = trpc.lp.list.useQuery();
  
  const createMutation = trpc.lp.create.useMutation({
    onSuccess: () => {
      utils.lp.list.invalidate();
      setIsAddDialogOpen(false);
      setNewUrl("");
      setNewTitle("");
      setNewDescription("");
      toast.success("LPを登録しました");
    },
    onError: (error) => {
      toast.error(`登録に失敗しました: ${error.message}`);
    },
  });

  const deleteMutation = trpc.lp.delete.useMutation({
    onSuccess: () => {
      utils.lp.list.invalidate();
      toast.success("LPを削除しました");
    },
    onError: (error) => {
      toast.error(`削除に失敗しました: ${error.message}`);
    },
  });

  const checkMutation = trpc.monitoring.check.useMutation({
    onSuccess: (data) => {
      if (data.contentChanged) {
        toast.warning(data.message);
      } else if (data.linkBroken) {
        toast.error(data.message);
      } else {
        toast.success(data.message);
      }
    },
    onError: (error) => {
      toast.error(`チェックに失敗しました: ${error.message}`);
    },
  });

  const handleCreate = () => {
    if (!newUrl) {
      toast.error("URLを入力してください");
      return;
    }
    createMutation.mutate({ url: newUrl, title: newTitle || undefined, description: newDescription || undefined });
  };

  const handleDelete = (id: number) => {
    if (confirm("このLPを削除してもよろしいですか?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleCheck = (id: number) => {
    checkMutation.mutate({ landingPageId: id });
  };

  const handleViewHistory = (id: number) => {
    setLocation(`/history/${id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">LP管理</h1>
          <p className="text-muted-foreground mt-2">登録したランディングページの一覧と管理</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  LP登録
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新しいLPを登録</DialogTitle>
                  <DialogDescription>監視するランディングページのURLを入力してください</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="url">URL *</Label>
                    <Input
                      id="url"
                      type="url"
                      placeholder="https://example.com"
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="title">タイトル</Label>
                    <Input
                      id="title"
                      placeholder="例: 商品紹介ページ"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">説明</Label>
                    <Textarea
                      id="description"
                      placeholder="このLPについてのメモ"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    登録
                  </Button>
                </DialogFooter>
              </DialogContent>
        </Dialog>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          {!landingPages || landingPages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>登録されているLPがありません</p>
              <p className="text-sm mt-2">右上の「LP登録」ボタンから新しいLPを追加してください</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>タイトル</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>説明</TableHead>
                  <TableHead>登録日</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {landingPages.map((lp) => (
                  <TableRow key={lp.id}>
                    <TableCell className="font-medium">{lp.title || "未設定"}</TableCell>
                    <TableCell>
                      <a href={lp.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {lp.url}
                      </a>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{lp.description || "-"}</TableCell>
                    <TableCell>{new Date(lp.createdAt).toLocaleDateString("ja-JP")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCheck(lp.id)}
                          disabled={checkMutation.isPending}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleViewHistory(lp.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(lp.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
