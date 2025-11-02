import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Eye, RefreshCw, Search, X } from "lucide-react";
import { useLocation } from "wouter";
import { TagManager } from "@/components/TagManager";
import { LPTagSelector } from "@/components/LPTagSelector";

export default function LandingPages() {
  const [, setLocation] = useLocation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: landingPages, isLoading } = trpc.lp.list.useQuery();
  const { data: allTags } = trpc.tags.list.useQuery();
  
  const createMutation = trpc.lp.create.useMutation({
    onSuccess: () => {
      utils.lp.list.invalidate();
      setIsAddDialogOpen(false);
      setNewUrl("");
      setNewTitle("");
      setNewDescription("");
      toast.success("LPを登録しました");
    },
    onError: (error: any) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const deleteMutation = trpc.lp.delete.useMutation({
    onSuccess: () => {
      utils.lp.list.invalidate();
      toast.success("LPを削除しました");
    },
    onError: (error: any) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const monitorMutation = trpc.lp.monitor.useMutation({
    onSuccess: () => {
      toast.success("監視チェックを開始しました");
    },
    onError: (error: any) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  // Filter and search logic
  const filteredLPs = useMemo(() => {
    if (!landingPages) return [];
    
    return landingPages.filter((lp) => {
      // Search filter
      const matchesSearch = !searchQuery || 
        lp.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lp.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lp.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Tag filter (will be enhanced with actual tag data)
      const matchesTag = !selectedTagFilter;
      
      return matchesSearch && matchesTag;
    });
  }, [landingPages, searchQuery, selectedTagFilter]);

  const handleCreate = () => {
    if (!newUrl.trim()) {
      toast.error("URLを入力してください");
      return;
    }
    createMutation.mutate({
      url: newUrl.trim(),
      title: newTitle.trim() || undefined,
      description: newDescription.trim() || undefined,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("このLPを削除しますか？")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleMonitor = (id: number) => {
    monitorMutation.mutate({ id });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
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
                <DialogDescription>
                  監視したいランディングページのURLを登録してください
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="url">URL *</Label>
                  <Input
                    id="url"
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://example.com/lp"
                  />
                </div>
                <div>
                  <Label htmlFor="title">タイトル</Label>
                  <Input
                    id="title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="LPのタイトル"
                  />
                </div>
                <div>
                  <Label htmlFor="description">説明</Label>
                  <Textarea
                    id="description"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="このLPについての説明"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  キャンセル
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  登録
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Search and Filter */}
        <div className="flex gap-4 items-center flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="タイトル、URL、説明で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          {/* Tag filter */}
          {allTags && allTags.length > 0 && (
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-sm text-muted-foreground">タグ:</span>
              <Badge
                variant={selectedTagFilter === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setSelectedTagFilter(null)}
              >
                すべて
              </Badge>
              {allTags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant={selectedTagFilter === tag.id ? "default" : "outline"}
                  style={selectedTagFilter === tag.id ? { backgroundColor: tag.color, color: "white" } : {}}
                  className="cursor-pointer"
                  onClick={() => setSelectedTagFilter(tag.id)}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        
        {/* Tag Manager */}
        <Card>
          <CardContent className="pt-6">
            <TagManager />
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          {!filteredLPs || filteredLPs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {landingPages && landingPages.length > 0 ? (
                <>
                  <p>検索条件に一致するLPがありません</p>
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearchQuery("");
                      setSelectedTagFilter(null);
                    }}
                    className="mt-2"
                  >
                    フィルターをクリア
                  </Button>
                </>
              ) : (
                <>
                  <p>登録されているLPがありません</p>
                  <p className="text-sm mt-2">右上の「LP登録」ボタンから新しいLPを追加してください</p>
                </>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>タイトル</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>タグ</TableHead>
                  <TableHead>説明</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLPs.map((lp) => (
                  <TableRow key={lp.id}>
                    <TableCell className="font-medium">{lp.title || "無題"}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      <a href={lp.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {lp.url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <LPTagSelector landingPageId={lp.id} />
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{lp.description || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMonitor(lp.id)}
                          disabled={monitorMutation.isPending}
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation(`/history/${lp.id}`)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
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
