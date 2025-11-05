import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Eye, RefreshCw, Search, X, Pencil, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { LPTagSelector } from "@/components/LPTagSelector";
import { useAuth } from "@/_core/hooks/useAuth";

export default function LandingPages() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingLP, setEditingLP] = useState<{ id: number; url: string; title?: string; description?: string } | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null); // ソートキー
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc"); // ソート方向
  const [monitoringLpIds, setMonitoringLpIds] = useState<Set<number>>(new Set()); // 監視実行中のLPのIDセット
  const [isMonitoringAll, setIsMonitoringAll] = useState(false); // 全監視実行中フラグ
  const monitoringAllStartTimeRef = useRef<number | null>(null); // 全監視実行開始時刻
  const expectedLpCountRef = useRef<number>(0); // 期待される監視完了数

  const utils = trpc.useUtils();
  const { data: landingPages, isLoading } = trpc.lp.list.useQuery(undefined, {
    // このクエリは10分間キャッシュを使用（LPリストは頻繁に変わらない）
    staleTime: 1000 * 60 * 10,
    // ウィンドウフォーカス時は再取得しない
    refetchOnWindowFocus: false,
    // マウント時もキャッシュがあれば使用
    refetchOnMount: false,
  });
  
  // プラン設定
  const PLAN_CONFIG = {
    free: { name: "フリープラン", maxLpCount: 3 },
    light: { name: "ライトプラン", maxLpCount: 15 },
    pro: { name: "プロプラン", maxLpCount: null },
  } as const;
  
  const userPlan = (user?.plan as "free" | "light" | "pro") || "free";
  const maxLpCount = PLAN_CONFIG[userPlan].maxLpCount;
  const currentLpCount = landingPages?.length || 0;
  const isAtLimit = maxLpCount !== null && currentLpCount >= maxLpCount;
  
  const { data: allTags } = trpc.tags.list.useQuery(undefined, {
    // タグリストも10分間キャッシュ
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // 各LPの最新監視履歴を取得（LP数分の履歴を取得）
  // limitを十分に大きくして、すべてのLPの最新履歴を取得できるようにする
  const { data: recentHistory } = trpc.monitoring.recent.useQuery(
    { limit: landingPages?.length ? Math.max(landingPages.length * 10, 100) : 100 },
    {
      staleTime: 0, // キャッシュを使わずに常に最新を取得
      refetchOnWindowFocus: true, // ウィンドウフォーカス時に再取得
      refetchOnMount: true, // マウント時に再取得
      refetchInterval: 30000, // 30秒ごとに自動更新
    }
  );

  // 各LPの最新ステータスと最終変更日をマッピング
  const lpStatusMap = useMemo(() => {
    if (!recentHistory || !landingPages) return new Map<number, { status: string; checkType?: string; createdAt: string; lastChangedAt?: string }>();
    
    const statusMap = new Map<number, { status: string; checkType?: string; createdAt: string; lastChangedAt?: string }>();
    
    landingPages.forEach((lp) => {
      // 各LPの全履歴を取得
      const lpHistory = recentHistory
        .filter((h) => {
          const lpId = (h as any).landingPageId ?? (h as any).landing_page_id;
          return lpId === lp.id;
        })
        .sort((a, b) => {
          const aDate = (a as any).createdAt ?? (a as any).created_at;
          const bDate = (b as any).createdAt ?? (b as any).created_at;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        });
      
      if (lpHistory.length > 0) {
        // 最新履歴
        const latest = lpHistory[0];
        // 最終変更日（status === "changed"の最新履歴）
        const lastChanged = lpHistory.find((h) => h.status === "changed");
        
        statusMap.set(lp.id, {
          status: latest.status,
          checkType: (latest as any).checkType ?? (latest as any).check_type,
          createdAt: (latest as any).createdAt ?? (latest as any).created_at,
          lastChangedAt: lastChanged ? ((lastChanged as any).createdAt ?? (lastChanged as any).created_at) : undefined,
        });
      }
    });
    
    return statusMap;
  }, [recentHistory, landingPages]);

  // 未変更期間を計算する関数
  const getDaysSinceLastChange = (lastChangedAt?: string): number | null => {
    if (!lastChangedAt) return null;
    const lastChangeDate = new Date(lastChangedAt);
    const now = new Date();
    const diffTime = now.getTime() - lastChangeDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };
  
  const createMutation = trpc.lp.create.useMutation({
    onSuccess: async (data) => {
      // 新しく作成されたLPを取得
      const newLP = await utils.lp.list.fetch();
      const createdLP = newLP?.find((lp) => lp.id === data.id);
      
      if (createdLP) {
        // Optimistic update: キャッシュを即座に更新
        utils.lp.list.setData(undefined, (old) => {
          if (!old) return [createdLP];
          return [...old, createdLP];
        });
      } else {
        // キャッシュを無効化して再取得
        utils.lp.list.invalidate();
      }
      
      setIsAddDialogOpen(false);
      setNewUrl("");
      setNewTitle("");
      setNewDescription("");
      toast.success("LPを登録しました。初期監視を実行中です...");
      
      // 初期監視の完了を検知するポーリング
      const startTime = Date.now();
      const startTimeDate = new Date(startTime - 15000); // 15秒前からチェック（余裕を持たせる）
      let checkCount = 0;
      const maxChecks = 60; // 最大60回チェック（約3分）
      
      const checkInterval = setInterval(async () => {
        checkCount++;
        
        // タイムアウトチェック
        if (checkCount > maxChecks || Date.now() - startTime > 3 * 60 * 1000) {
          clearInterval(checkInterval);
          toast.warning("初期監視がタイムアウトしました");
          utils.monitoring.recent.invalidate();
          return;
        }
        
        try {
          // キャッシュを無効化してから取得
          utils.monitoring.history.invalidate({ landingPageId: data.id });
          const history = await utils.monitoring.history.fetch(
            { landingPageId: data.id },
            { staleTime: 0 } // キャッシュを使わずに常に最新を取得
          );
          
          if (history && history.length > 0) {
            // 最新の履歴を取得
            const latest = history[0];
            const historyTime = new Date(latest.createdAt);
            
            console.log(`[Initial Monitor] LP ${data.id}: Checking history at ${historyTime.toISOString()}, start time: ${startTimeDate.toISOString()}`);
            
            // 開始時刻より新しい履歴があるかチェック
            if (historyTime >= startTimeDate) {
              clearInterval(checkInterval);
              
              console.log(`[Initial Monitor] LP ${data.id}: Completed with status ${latest.status}`);
              
              // 初期監視完了通知
              if (latest.status === "ok") {
                toast.success("初期監視が完了しました。変更は検出されませんでした。");
              } else if (latest.status === "changed") {
                toast.warning(`初期監視が完了しました。変更が検出されました: ${latest.message}`);
              } else if (latest.status === "error") {
                toast.error(`初期監視が完了しました。エラーが発生しました: ${latest.message}`);
              }
              
              // 監視履歴を更新してステータスを反映
              utils.monitoring.recent.invalidate();
              // 特定のLPの履歴も無効化（履歴ページで最新情報が表示されるように）
              utils.monitoring.history.invalidate({ landingPageId: data.id });
              utils.monitoring.history.invalidate();
            }
          } else {
            console.log(`[Initial Monitor] LP ${data.id}: No history found yet (check ${checkCount})`);
          }
        } catch (error) {
          console.error(`[Initial Monitor] LP ${data.id}: Error checking completion:`, error);
        }
      }, 3000); // 3秒ごとにチェック
    },
    onError: (error: any) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const updateMutation = trpc.lp.update.useMutation({
    onSuccess: () => {
      utils.lp.list.invalidate();
      setIsEditDialogOpen(false);
      setEditingLP(null);
      toast.success("LPを更新しました");
    },
    onError: (error: any) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const deleteMutation = trpc.lp.delete.useMutation({
    onSuccess: (_, variables) => {
      // Optimistic update: キャッシュから即座に削除
      utils.lp.list.setData(undefined, (old) => {
        if (!old) return [];
        return old.filter((lp) => lp.id !== variables.id);
      });
      toast.success("LPを削除しました");
    },
    onError: (error: any) => {
      toast.error(`エラー: ${error.message}`);
      // エラー時は再取得して整合性を保つ
      utils.lp.list.invalidate();
    },
  });

  const monitorMutation = trpc.lp.monitor.useMutation({
    onMutate: async (variables) => {
      // 監視開始時：該当LPのIDを追加
      setMonitoringLpIds((prev) => new Set([...prev, variables.id]));
    },
    onSuccess: (data, variables) => {
      // 監視完了時：該当LPのIDを削除
      setMonitoringLpIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });

      const result = data.result;
      if (result.linkBroken) {
        toast.error(`監視完了: ${result.message}`);
      } else if (result.contentChanged) {
        toast.warning(`監視完了: ${result.message}`);
      } else {
        toast.success(`監視完了: ${result.message}`);
      }
      // 監視履歴を更新（該当LPの履歴も無効化）
      utils.monitoring.history.invalidate({ landingPageId: variables.id });
      utils.monitoring.history.invalidate();
      utils.monitoring.recent.invalidate();
    },
    onError: (error: any, variables) => {
      // エラー時も：該当LPのIDを削除
      setMonitoringLpIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
      toast.error(`監視エラー: ${error.message}`);
    },
  });

  const monitorAllMutation = trpc.lp.monitorAll.useMutation({
    onMutate: async () => {
      // 全部実行開始時：全てのLPのIDを追加
      if (landingPages) {
        const lpIds = landingPages.map((lp) => lp.id);
        setMonitoringLpIds(new Set(lpIds));
        setIsMonitoringAll(true);
        // 開始時刻を記録（少し前の時刻を記録して、余裕を持たせる）
        monitoringAllStartTimeRef.current = Date.now() - 5000; // 5秒前から開始として記録
        expectedLpCountRef.current = landingPages.length;
        console.log(`[Monitor All] Started monitoring for ${landingPages.length} LPs. Start time: ${new Date(monitoringAllStartTimeRef.current).toISOString()}`);
      }
    },
    onSuccess: (data) => {
      toast.success(data.message);
      // 完了検知はuseEffectのポーリングで行う
    },
    onError: (error: any) => {
      // エラー時：全てのIDをクリア
      setMonitoringLpIds(new Set());
      setIsMonitoringAll(false);
      monitoringAllStartTimeRef.current = null;
      expectedLpCountRef.current = 0;
      toast.error(`一括監視エラー: ${error.message}`);
    },
  });

  // 全監視実行の完了を検知するポーリング（シンプルで確実な方法）
  useEffect(() => {
    if (!isMonitoringAll || !monitoringAllStartTimeRef.current || expectedLpCountRef.current === 0 || !landingPages) {
      return;
    }

    const targetLpIds = Array.from(new Set(landingPages.map((lp) => lp.id)));
    const startTime = monitoringAllStartTimeRef.current;
    // 開始時刻をさらに10秒前に設定（余裕を持たせる）
    const startTimeDate = new Date(startTime - 10000);

    let checkCount = 0;
    const maxChecks = 100; // 最大100回チェック（約5分）

    const checkInterval = setInterval(async () => {
      checkCount++;
      const currentStartTime = monitoringAllStartTimeRef.current;
      if (!currentStartTime) {
        clearInterval(checkInterval);
        return;
      }

      // タイムアウトチェック
      const elapsed = Date.now() - currentStartTime;
      if (elapsed > 5 * 60 * 1000 || checkCount > maxChecks) {
        clearInterval(checkInterval);
        setIsMonitoringAll(false);
        setMonitoringLpIds(new Set());
        monitoringAllStartTimeRef.current = null;
        expectedLpCountRef.current = 0;
        toast.warning("全監視実行がタイムアウトしました（5分）");
        utils.monitoring.history.invalidate();
        utils.monitoring.recent.invalidate();
        return;
      }

      // 各LPの最新監視履歴を取得
      try {
        const completedLpIds = new Set<number>();
        const results: Array<{ lpId: number; status: string }> = [];
        
        // 各LPの監視履歴を並列で取得（キャッシュを無効化して強制的に再取得）
        await Promise.all(
          targetLpIds.map(async (lpId) => {
            try {
              // キャッシュを無効化してから取得
              utils.monitoring.history.invalidate({ landingPageId: lpId });
              const history = await utils.monitoring.history.fetch(
                { landingPageId: lpId },
                { staleTime: 0 } // キャッシュを使わずに常に最新を取得
              );
              
              if (history && history.length > 0) {
                // 最新の履歴を取得
                const latest = history[0]; // 既に新しい順でソートされている
                const historyTime = new Date(latest.createdAt);
                
                // 開始時刻より新しい履歴があるかチェック（開始時刻を30秒前に設定しているので、ほぼ確実にマッチする）
                if (historyTime >= startTimeDate) {
                  completedLpIds.add(lpId);
                  results.push({ lpId, status: latest.status });
                  console.log(`[Monitor All] LP ${lpId} completed: ${latest.status} at ${historyTime.toISOString()}`);
                } else {
                  console.log(`[Monitor All] LP ${lpId} not completed yet: latest history at ${historyTime.toISOString()} < ${startTimeDate.toISOString()}`);
                }
              } else {
                console.log(`[Monitor All] LP ${lpId} has no history yet`);
              }
            } catch (error) {
              console.error(`[Monitor All] Error fetching history for LP ${lpId}:`, error);
            }
          })
        );

        console.log(`[Monitor All] Progress: ${completedLpIds.size}/${expectedLpCountRef.current} LPs completed`);

        // 全LPの監視が完了したかチェック
        if (completedLpIds.size >= expectedLpCountRef.current) {
          console.log(`[Monitor All] ✅ All monitoring completed!`);
          clearInterval(checkInterval);
          setIsMonitoringAll(false);
          setMonitoringLpIds(new Set());
          monitoringAllStartTimeRef.current = null;
          expectedLpCountRef.current = 0;

          // サマリーを計算
          const okCount = results.filter((r) => r.status === "ok").length;
          const changedCount = results.filter((r) => r.status === "changed").length;
          const errorCount = results.filter((r) => r.status === "error").length;

          // サマリー通知
          const summaryMessage = `全監視実行が完了しました。\n正常: ${okCount}件、変更検出: ${changedCount}件、エラー: ${errorCount}件`;

          if (errorCount > 0 || changedCount > 0) {
            toast.warning(summaryMessage, { duration: 5000 });
          } else {
            toast.success(summaryMessage, { duration: 5000 });
          }

          // 監視履歴を更新（全LPの履歴を無効化して履歴ページで最新情報が表示されるように）
          utils.monitoring.history.invalidate();
          utils.monitoring.recent.invalidate();
          
          // 各LPの履歴も個別に無効化（履歴ページで最新情報が表示されるように）
          targetLpIds.forEach((lpId) => {
            utils.monitoring.history.invalidate({ landingPageId: lpId });
          });
        }
      } catch (error) {
        console.error("[Monitor All] Error checking completion:", error);
      }
    }, 3000); // 3秒ごとにチェック

    return () => {
      clearInterval(checkInterval);
    };
  }, [isMonitoringAll, landingPages, utils]);

  // Filter, search, and sort logic
  const filteredAndSortedLPs = useMemo(() => {
    if (!landingPages) return [];
    
    // フィルタリング
    let filtered = landingPages.filter((lp) => {
      // Search filter
      const matchesSearch = !searchQuery || 
        lp.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lp.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lp.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Tag filter (will be enhanced with actual tag data)
      const matchesTag = !selectedTagFilter;
      
      return matchesSearch && matchesTag;
    });

    // ソート
    if (sortKey) {
      filtered = [...filtered].sort((a, b) => {
        let aValue: any;
        let bValue: any;

        switch (sortKey) {
          case "title":
            aValue = a.title || "";
            bValue = b.title || "";
            break;
          case "url":
            aValue = a.url || "";
            bValue = b.url || "";
            break;
          case "status":
            const statusA = lpStatusMap.get(a.id);
            const statusB = lpStatusMap.get(b.id);
            // ステータスの優先順位: リンク切れ > その他エラー > changed > ok > 未監視
            const getStatusOrder = (status: string | undefined, checkType: string | undefined) => {
              if (!status) return 4; // 未監視
              if (status === "error" && checkType === "link_broken") return 0; // リンク切れ
              if (status === "error") return 1; // その他エラー
              if (status === "changed") return 2;
              if (status === "ok") return 3;
              return 4;
            };
            aValue = getStatusOrder(statusA?.status, statusA?.checkType);
            bValue = getStatusOrder(statusB?.status, statusB?.checkType);
            break;
          case "createdAt":
            aValue = new Date(a.createdAt).getTime();
            bValue = new Date(b.createdAt).getTime();
            break;
          case "lastChangedAt":
            const lastChangeA = lpStatusMap.get(a.id)?.lastChangedAt 
              ? new Date(lpStatusMap.get(a.id)!.lastChangedAt!).getTime()
              : new Date(a.createdAt).getTime();
            const lastChangeB = lpStatusMap.get(b.id)?.lastChangedAt 
              ? new Date(lpStatusMap.get(b.id)!.lastChangedAt!).getTime()
              : new Date(b.createdAt).getTime();
            aValue = lastChangeA;
            bValue = lastChangeB;
            break;
          case "daysSinceLastChange":
            const daysA = (() => {
              const lastChangeDate = lpStatusMap.get(a.id)?.lastChangedAt 
                ? new Date(lpStatusMap.get(a.id)!.lastChangedAt!)
                : new Date(a.createdAt);
              const now = new Date();
              return Math.floor((now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60 * 24));
            })();
            const daysB = (() => {
              const lastChangeDate = lpStatusMap.get(b.id)?.lastChangedAt 
                ? new Date(lpStatusMap.get(b.id)!.lastChangedAt!)
                : new Date(b.createdAt);
              const now = new Date();
              return Math.floor((now.getTime() - lastChangeDate.getTime()) / (1000 * 60 * 60 * 24));
            })();
            aValue = daysA;
            bValue = daysB;
            break;
          default:
            return 0;
        }

        // 文字列比較
        if (typeof aValue === "string" && typeof bValue === "string") {
          return sortDirection === "asc" 
            ? aValue.localeCompare(bValue, "ja")
            : bValue.localeCompare(aValue, "ja");
        }

        // 数値比較
        if (sortDirection === "asc") {
          return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        } else {
          return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
        }
      });
    }

    return filtered;
  }, [landingPages, searchQuery, selectedTagFilter, sortKey, sortDirection, lpStatusMap]);

  // ソート処理
  const handleSort = (key: string) => {
    if (sortKey === key) {
      // 同じキーをクリックした場合は方向を切り替え
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // 新しいキーをクリックした場合は昇順で開始
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  // ソートアイコンを取得
  const getSortIcon = (key: string) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="w-4 h-4 ml-1" />
      : <ArrowDown className="w-4 h-4 ml-1" />;
  };

  const handleCreate = () => {
    if (!newUrl.trim()) {
      toast.error("URLを入力してください");
      return;
    }
    if (!newTitle.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    createMutation.mutate({
      url: newUrl.trim(),
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
    });
  };

  const handleEdit = (lp: { id: number; url: string; title?: string; description?: string }) => {
    setEditingLP(lp);
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (!editingLP) return;
    
    if (!editingLP.url.trim()) {
      toast.error("URLを入力してください");
      return;
    }
    
    if (!editingLP.title || !editingLP.title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    
    updateMutation.mutate({
      id: editingLP.id,
      url: editingLP.url.trim(),
      title: editingLP.title.trim(),
      description: editingLP.description?.trim() || undefined,
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => monitorAllMutation.mutate()}
              disabled={isMonitoringAll || monitorAllMutation.isPending || monitorMutation.isPending}
              className="bg-white"
            >
              {isMonitoringAll || monitorAllMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  全監視実行中...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  全監視実行
                </>
              )}
            </Button>
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
              {isAtLimit && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800">
                      {PLAN_CONFIG[userPlan].name}では、最大{maxLpCount}ページまで登録できます。
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      現在 {currentLpCount}/{maxLpCount} ページ登録中です。プランをアップグレードすると、より多くのページを登録できます。
                    </p>
                  </div>
                </div>
              )}
              {!isAtLimit && maxLpCount !== null && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-800">
                    {PLAN_CONFIG[userPlan].name}: {currentLpCount}/{maxLpCount} ページ登録中
                  </p>
                </div>
              )}
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="title" className="mb-2 block">タイトル *</Label>
                        <Input
                          id="title"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="LPのタイトル"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="url" className="mb-2 block">URL *</Label>
                        <Input
                          id="url"
                          type="url"
                          value={newUrl}
                          onChange={(e) => setNewUrl(e.target.value)}
                          placeholder="https://example.com/lp"
                        />
                      </div>
                <div>
                  <Label htmlFor="description" className="mb-2 block">説明</Label>
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
                <Button onClick={handleCreate} disabled={createMutation.isPending || isAtLimit}>
                  {isAtLimit ? "登録上限に達しています" : "登録"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {/* Edit Dialog */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>LPを編集</DialogTitle>
                <DialogDescription>
                  ランディングページの情報を編集してください
                </DialogDescription>
              </DialogHeader>
                    {editingLP && (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="edit-title" className="mb-2 block">タイトル *</Label>
                          <Input
                            id="edit-title"
                            value={editingLP.title || ""}
                            onChange={(e) => setEditingLP({ ...editingLP, title: e.target.value })}
                            placeholder="LPのタイトル"
                            required
                            disabled={updateMutation.isPending}
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit-url" className="mb-2 block">URL *</Label>
                          <Input
                            id="edit-url"
                            type="url"
                            value={editingLP.url}
                            onChange={(e) => setEditingLP({ ...editingLP, url: e.target.value })}
                            placeholder="https://example.com/lp"
                            disabled={updateMutation.isPending}
                          />
                        </div>
                  <div>
                    <Label htmlFor="edit-description" className="mb-2 block">説明</Label>
                    <Textarea
                      id="edit-description"
                      value={editingLP.description || ""}
                      onChange={(e) => setEditingLP({ ...editingLP, description: e.target.value })}
                      placeholder="このLPについての説明"
                      rows={3}
                      disabled={updateMutation.isPending}
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setEditingLP(null);
                  }}
                  disabled={updateMutation.isPending}
                >
                  キャンセル
                </Button>
                <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      更新中...
                    </>
                  ) : (
                    "更新"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>
        
        {/* Search and Filter */}
        <div className="flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="タイトル、URL、説明で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 bg-white"
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
            <Select
              value={selectedTagFilter?.toString() || "all"}
              onValueChange={(value) => setSelectedTagFilter(value === "all" ? null : parseInt(value))}
            >
              <SelectTrigger className="w-[200px] bg-white">
                <SelectValue placeholder="タグで絞り込み" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのタグ</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id.toString()}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      
      <Card>
        <CardContent className="pt-6">
          {!filteredAndSortedLPs || filteredAndSortedLPs.length === 0 ? (
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
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-center">
                    <button
                      onClick={() => handleSort("title")}
                      className="flex items-center justify-center mx-auto hover:opacity-70 transition-opacity"
                    >
                      タイトル
                      {getSortIcon("title")}
                    </button>
                  </TableHead>
                  <TableHead className="text-center">
                    <button
                      onClick={() => handleSort("url")}
                      className="flex items-center justify-center mx-auto hover:opacity-70 transition-opacity"
                    >
                      URL
                      {getSortIcon("url")}
                    </button>
                  </TableHead>
                  <TableHead className="text-center">
                    <button
                      onClick={() => handleSort("status")}
                      className="flex items-center justify-center mx-auto hover:opacity-70 transition-opacity"
                    >
                      ステータス
                      {getSortIcon("status")}
                    </button>
                  </TableHead>
                  <TableHead className="text-center">
                    <button
                      onClick={() => handleSort("createdAt")}
                      className="flex items-center justify-center mx-auto hover:opacity-70 transition-opacity"
                    >
                      登録日
                      {getSortIcon("createdAt")}
                    </button>
                  </TableHead>
                  <TableHead className="text-center">
                    <button
                      onClick={() => handleSort("lastChangedAt")}
                      className="flex items-center justify-center mx-auto hover:opacity-70 transition-opacity"
                    >
                      最終変更日
                      {getSortIcon("lastChangedAt")}
                    </button>
                  </TableHead>
                  <TableHead className="text-center">
                    <button
                      onClick={() => handleSort("daysSinceLastChange")}
                      className="flex items-center justify-center mx-auto hover:opacity-70 transition-opacity"
                    >
                      未変更期間
                      {getSortIcon("daysSinceLastChange")}
                    </button>
                  </TableHead>
                  <TableHead className="text-center">タグ</TableHead>
                  <TableHead className="text-center">説明</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedLPs.map((lp) => {
                  const status = lpStatusMap.get(lp.id);
                  const daysSinceLastChange = getDaysSinceLastChange(status?.lastChangedAt);
                  return (
                    <TableRow key={lp.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{lp.title}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        <a href={lp.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {lp.url}
                        </a>
                      </TableCell>
                      <TableCell>
                        {status ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                status.status === "ok"
                                  ? "default"
                                  : status.status === "changed"
                                  ? "secondary"
                                  : "destructive"
                              }
                              className={
                                status.status === "ok"
                                  ? "bg-green-100 text-green-800 hover:bg-green-100"
                                  : status.status === "changed"
                                  ? "bg-orange-100 text-orange-800 hover:bg-orange-100"
                                  : "bg-red-100 text-red-800 hover:bg-red-100"
                              }
                            >
                              {status.status === "ok"
                                ? "変更なし"
                                : status.status === "changed"
                                ? "変更検出"
                                : status.status === "error" && status.checkType === "link_broken"
                                ? "リンク切れ"
                                : "エラー"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(status.createdAt).toLocaleDateString("ja-JP", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">未監視</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">
                          {new Date(lp.createdAt).toLocaleDateString("ja-JP", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">
                          {status?.lastChangedAt
                            ? new Date(status.lastChangedAt).toLocaleDateString("ja-JP", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : new Date(lp.createdAt).toLocaleDateString("ja-JP", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          // 最終変更日がなければ登録日から計算
                          const lastChangeDate = status?.lastChangedAt 
                            ? new Date(status.lastChangedAt)
                            : new Date(lp.createdAt);
                          const now = new Date();
                          const diffTime = now.getTime() - lastChangeDate.getTime();
                          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                          
                          return (
                            <span className="text-sm">
                              {`${diffDays}日`}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center">
                          <LPTagSelector landingPageId={lp.id} />
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{lp.description || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMonitor(lp.id)}
                            disabled={monitoringLpIds.has(lp.id) || monitorAllMutation.isPending}
                            title={monitoringLpIds.has(lp.id) || monitorAllMutation.isPending ? "監視実行中..." : "監視を実行"}
                          >
                            <RefreshCw className={`w-4 h-4 ${monitoringLpIds.has(lp.id) || monitorAllMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLocation(`/history/${lp.id}`)}
                            title="履歴を表示"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(lp)}
                            title="編集"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(lp.id)}
                            disabled={deleteMutation.isPending}
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
