import { useMemo, useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Eye,
  RefreshCw,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { useLocation } from "wouter";
import { CreativeTagSelector } from "@/components/CreativeTagSelector";
import { useAuth } from "@/_core/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type CreativeFormState = {
  title: string;
  imageUrl: string;
  landingPageId?: number | null;
  targetUrl?: string | null;
  description?: string | null;
};

export default function Creatives() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCreativeId, setEditingCreativeId] = useState<number | null>(
    null
  );
  const [formState, setFormState] = useState<CreativeFormState>({
    title: "",
    imageUrl: "",
    landingPageId: null,
    targetUrl: null,
    description: "",
  });

  const [sortKey, setSortKey] = useState<
    "title" | "url" | "status" | "createdAt" | "lastChangedAt" | "daysSince" | null
  >(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState<number | null>(null);
  const [monitoringCreativeIds, setMonitoringCreativeIds] = useState<Set<number>>(new Set()); // 監視実行中のクリエイティブのIDセット
  const [isMonitoringAll, setIsMonitoringAll] = useState(false); // 全監視実行中フラグ
  const monitoringAllStartTimeRef = useRef<number | null>(null); // 全監視実行開始時刻
  const expectedCreativeCountRef = useRef<number>(0); // 期待される監視完了数

  const utils = trpc.useUtils();

  const { data: creatives, isLoading } = trpc.creatives.list.useQuery(
    undefined,
    {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    }
  );

  // プラン設定
  const PLAN_CONFIG = {
    free: { name: "フリープラン", maxCreativeCount: 10 },
    light: { name: "ライトプラン", maxCreativeCount: 50 },
    pro: { name: "プロプラン", maxCreativeCount: null },
    admin: { name: "管理者プラン", maxCreativeCount: null },
  } as const;

  const userPlan = (user?.plan as "free" | "light" | "pro" | "admin") || "free";
  const maxCreativeCount = PLAN_CONFIG[userPlan].maxCreativeCount;
  const currentCreativeCount = creatives?.length || 0;
  const isAtLimit = maxCreativeCount !== null && currentCreativeCount >= maxCreativeCount;

  const { data: allTags } = trpc.tags.list.useQuery(undefined, {
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // 各クリエイティブに紐づくタグID（フィルタ用）
  const { data: creativeTagRelations } =
    trpc.tags.getForUserCreatives.useQuery(undefined, {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    });
  
  // 手動監視のクォータ状況を取得
  const { data: quotaData } = trpc.manualMonitoringQuota.get.useQuery(undefined, {
    staleTime: 0, // 常に最新を取得
    refetchInterval: 60000, // 60秒ごとに自動更新
    refetchOnWindowFocus: true,
  });

  const creativeTagMap = useMemo(() => {
    const map = new Map<number, Set<number>>();
    if (!creativeTagRelations) return map;
    for (const rel of creativeTagRelations as any[]) {
      const creativeId = rel.creativeId ?? rel.creative_id;
      const tagId = rel.tagId ?? rel.tag_id;
      if (!creativeId || !tagId) continue;
      if (!map.has(creativeId)) {
        map.set(creativeId, new Set<number>());
      }
      map.get(creativeId)!.add(tagId);
    }
    return map;
  }, [creativeTagRelations]);

  // クリエイティブ用スケジュール設定（監視ON/OFFトグル用）
  const creativeScheduleQuery = trpc.creativeSchedules.get.useQuery();
  const creativeScheduleUpsert =
    trpc.creativeSchedules.upsert.useMutation();

  // 最近の監視履歴（ステータス・最終変更日・未変更期間のため）
  const { data: recentCreativeHistory, isLoading: isRecentCreativeHistoryLoading } =
    trpc.monitoring.creativeRecent.useQuery(
      {
        limit: creatives?.length
          ? Math.max(creatives.length * 10, 100)
          : 100,
      },
      {
        enabled: !!creatives && !isLoading, // creativesが読み込まれてから実行
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchInterval: 30000,
      }
    );

  const createMutation = trpc.creatives.create.useMutation({
    onSuccess: async (data) => {
      // 新しく作成されたクリエイティブを取得
      const newCreatives = await utils.creatives.list.fetch();
      const createdCreative = newCreatives?.find((creative) => creative.id === data.id);
      
      if (createdCreative) {
        // Optimistic update: キャッシュを即座に更新
        utils.creatives.list.setData(undefined, (old) => {
          if (!old) return [createdCreative];
          return [...old, createdCreative];
        });
      } else {
        // キャッシュを無効化して再取得
        utils.creatives.list.invalidate();
      }
      
      setIsAddDialogOpen(false);
      setFormState({
        title: "",
        imageUrl: "",
        landingPageId: null,
        targetUrl: null,
        description: "",
      });
      toast.success("クリエイティブを登録しました。初期監視を実行中です...");
      
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
          utils.monitoring.creativeRecent.invalidate();
          return;
        }
        
        try {
          // キャッシュを無効化してから取得
          utils.creatives.history.invalidate({ creativeId: data.id });
          const history = await utils.creatives.history.fetch(
            { creativeId: data.id },
            { staleTime: 0 } // キャッシュを使わずに常に最新を取得
          );
          
          if (history && history.length > 0) {
            // 最新の履歴を取得
            const latest = history[0];
            const historyTime = new Date(latest.createdAt);
            
            console.log(`[Initial Monitor] Creative ${data.id}: Checking history at ${historyTime.toISOString()}, start time: ${startTimeDate.toISOString()}`);
            
            // 開始時刻より新しい履歴があるかチェック
            if (historyTime >= startTimeDate) {
              clearInterval(checkInterval);
              
              console.log(`[Initial Monitor] Creative ${data.id}: Completed with status ${latest.status}`);
              
              // 初期監視完了通知
              if (latest.status === "ok") {
                toast.success("初期監視が完了しました。変更は検出されませんでした。");
              } else if (latest.status === "changed") {
                toast.warning(`初期監視が完了しました。変更が検出されました: ${latest.message}`);
              } else if (latest.status === "error") {
                toast.error(`初期監視が完了しました。エラーが発生しました: ${latest.message}`);
              }
              
              // 監視履歴を更新してステータスを反映
              utils.monitoring.creativeRecent.invalidate();
              // 特定のクリエイティブの履歴も無効化（履歴ページで最新情報が表示されるように）
              utils.creatives.history.invalidate({ creativeId: data.id });
            }
          } else {
            console.log(`[Initial Monitor] Creative ${data.id}: No history found yet (check ${checkCount})`);
          }
        } catch (error) {
          console.error(`[Initial Monitor] Creative ${data.id}: Error checking completion:`, error);
        }
      }, 3000); // 3秒ごとにチェック
    },
    onError: (error: any) => {
      toast.error(`エラー: ${error.message}`);
    },
  });

  const updateMutation = trpc.creatives.update.useMutation({
    onSuccess: () => {
      utils.creatives.list.invalidate();
      setIsEditDialogOpen(false);
      setEditingCreativeId(null);
      toast.success("クリエイティブを更新しました");
    },
    onError: (error: any) => {
      toast.error(error.message || "クリエイティブの更新に失敗しました");
    },
  });

  const deleteMutation = trpc.creatives.delete.useMutation({
    onSuccess: () => {
      utils.creatives.list.invalidate();
      toast.success("クリエイティブを削除しました");
    },
    onError: (error: any) => {
      toast.error(error.message || "クリエイティブの削除に失敗しました");
    },
  });

  const monitorMutation = trpc.creatives.monitor.useMutation({
    onMutate: async (variables) => {
      // 監視開始時：該当クリエイティブのIDを追加
      setMonitoringCreativeIds((prev) => new Set([...prev, variables.id]));
    },
    onSuccess: (data, variables) => {
      // 監視完了時：該当クリエイティブのIDを削除
      setMonitoringCreativeIds((prev) => {
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
      // 監視履歴を更新（該当クリエイティブの履歴も無効化）
      utils.monitoring.creativeHistory.invalidate({ creativeId: variables.id });
      utils.monitoring.creativeRecent.invalidate();
      // クォータ情報を更新
      utils.manualMonitoringQuota.get.invalidate();
    },
    onError: (error: any, variables) => {
      // エラー時も：該当クリエイティブのIDを削除
      setMonitoringCreativeIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
      toast.error(`監視エラー: ${error.message}`);
    },
  });

  const monitorAllMutation = trpc.creatives.monitorAll.useMutation({
    onMutate: async () => {
      // 全部実行開始時：全てのクリエイティブのIDを追加
      if (creatives) {
        const creativeIds = creatives.map((creative) => creative.id);
        setMonitoringCreativeIds(new Set(creativeIds));
        setIsMonitoringAll(true);
        // 開始時刻を記録（少し前の時刻を記録して、余裕を持たせる）
        monitoringAllStartTimeRef.current = Date.now() - 5000; // 5秒前から開始として記録
        expectedCreativeCountRef.current = creatives.length;
        console.log(`[Monitor All] Started monitoring for ${creatives.length} creatives. Start time: ${new Date(monitoringAllStartTimeRef.current).toISOString()}`);
      }
    },
    onSuccess: (data) => {
      toast.success(
        data?.message ?? "全てのクリエイティブの監視を実行しました"
      );
      // 完了検知はuseEffectのポーリングで行う
    },
    onError: (error: any) => {
      toast.error(error.message || "全監視の実行に失敗しました");
      // エラー時：全てのIDをクリア
      setMonitoringCreativeIds(new Set());
      setIsMonitoringAll(false);
      monitoringAllStartTimeRef.current = null;
      expectedCreativeCountRef.current = 0;
    },
  });

  // 全監視実行の完了を検知するポーリング（LP管理と同様のロジック）
  useEffect(() => {
    if (!isMonitoringAll || !monitoringAllStartTimeRef.current || expectedCreativeCountRef.current === 0 || !creatives) {
      return;
    }

    const targetCreativeIds = Array.from(new Set(creatives.map((creative) => creative.id)));
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
        setMonitoringCreativeIds(new Set());
        monitoringAllStartTimeRef.current = null;
        expectedCreativeCountRef.current = 0;
        toast.warning("全監視実行がタイムアウトしました（5分）");
        utils.monitoring.creativeRecent.invalidate();
        targetCreativeIds.forEach((creativeId) => {
          utils.creatives.history.invalidate({ creativeId });
        });
        return;
      }

      // 各クリエイティブの最新監視履歴を取得
      try {
        const completedCreativeIds = new Set<number>();
        const skippedCreativeIds = new Set<number>();
        const results: Array<{ creativeId: number; status: string }> = [];
        
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        
        // 各クリエイティブの監視履歴を並列で取得（キャッシュを無効化して強制的に再取得）
        await Promise.all(
          targetCreativeIds.map(async (creativeId) => {
            try {
              // 1時間以内に監視実行されたクリエイティブはスキップとして扱う（管理者プランを除く）
              if (user?.plan !== "admin") {
                const status = creativeStatusMap.get(creativeId);
                if (status?.createdAt) {
                  const lastMonitoredAt = new Date(status.createdAt).getTime();
                  if (lastMonitoredAt > oneHourAgo) {
                    // 開始時刻より前に監視されたものはスキップとして扱う
                    if (lastMonitoredAt < startTime) {
                      skippedCreativeIds.add(creativeId);
                      console.log(`[Monitor All] Creative ${creativeId} skipped (monitored within 1 hour before start)`);
                      return;
                    }
                  }
                }
              }
              
              // キャッシュを無効化してから取得
              utils.creatives.history.invalidate({ creativeId });
              const history = await utils.creatives.history.fetch(
                { creativeId },
                { staleTime: 0 } // キャッシュを使わずに常に最新を取得
              );
              
              if (history && history.length > 0) {
                // 最新の履歴を取得
                const latest = history[0]; // 既に新しい順でソートされている
                const historyTime = new Date(latest.createdAt);
                
                // 開始時刻より新しい履歴があるかチェック（開始時刻を30秒前に設定しているので、ほぼ確実にマッチする）
                if (historyTime >= startTimeDate) {
                  completedCreativeIds.add(creativeId);
                  results.push({ creativeId, status: latest.status });
                  console.log(`[Monitor All] Creative ${creativeId} completed: ${latest.status} at ${historyTime.toISOString()}`);
                } else {
                  console.log(`[Monitor All] Creative ${creativeId} not completed yet: latest history at ${historyTime.toISOString()} < ${startTimeDate.toISOString()}`);
                }
              } else {
                console.log(`[Monitor All] Creative ${creativeId} has no history yet`);
              }
            } catch (error) {
              console.error(`[Monitor All] Error fetching history for creative ${creativeId}:`, error);
            }
          })
        );

        const totalProcessed = completedCreativeIds.size + skippedCreativeIds.size;
        console.log(`[Monitor All] Progress: ${completedCreativeIds.size} completed, ${skippedCreativeIds.size} skipped, total ${totalProcessed}/${expectedCreativeCountRef.current}`);

        // 全クリエイティブの監視が完了したかチェック（スキップされたものも含める）
        if (totalProcessed >= expectedCreativeCountRef.current) {
          console.log(`[Monitor All] ✅ All monitoring completed!`);
          clearInterval(checkInterval);
          setIsMonitoringAll(false);
          setMonitoringCreativeIds(new Set());
          monitoringAllStartTimeRef.current = null;
          expectedCreativeCountRef.current = 0;

          // サマリーを計算
          const okCount = results.filter((r) => r.status === "ok").length;
          const changedCount = results.filter((r) => r.status === "changed").length;
          const errorCount = results.filter((r) => r.status === "error").length;
          const skippedCount = skippedCreativeIds.size;

          // サマリー通知
          let summaryMessage = `全監視実行が完了しました。\n正常: ${okCount}件、変更検出: ${changedCount}件、エラー: ${errorCount}件`;
          if (skippedCount > 0) {
            summaryMessage += `、スキップ: ${skippedCount}件（1時間以内に監視実行済み）`;
          }

          if (errorCount > 0 || changedCount > 0) {
            toast.warning(summaryMessage, { duration: 5000 });
          } else {
            toast.success(summaryMessage, { duration: 5000 });
          }

          // 監視履歴を更新（全クリエイティブの履歴を無効化して履歴ページで最新情報が表示されるように）
          utils.monitoring.creativeRecent.invalidate();
          // クォータ情報も更新
          utils.manualMonitoringQuota.get.invalidate();
          
          // 各クリエイティブの履歴も個別に無効化（履歴ページで最新情報が表示されるように）
          targetCreativeIds.forEach((creativeId) => {
            utils.creatives.history.invalidate({ creativeId });
          });
        }
      } catch (error) {
        console.error("[Monitor All] Error checking completion:", error);
      }
    }, 3000); // 3秒ごとにチェック

    return () => {
      clearInterval(checkInterval);
    };
  // ステータスマップ（最新ステータス & 最終変更日）
  const creativeStatusMap = useMemo(() => {
    if (!recentCreativeHistory || !creatives) return new Map<
      number,
      { status: string; createdAt: string; lastChangedAt?: string }
    >();

    const statusMap = new Map<
      number,
      { status: string; createdAt: string; lastChangedAt?: string }
    >();

    creatives.forEach((c: any) => {
      const historyForCreative = recentCreativeHistory
        .filter((h: any) => {
          const cid = h.creativeId ?? h.creative_id;
          return cid === c.id;
        })
        .sort((a: any, b: any) => {
          const aDate = a.createdAt ?? a.created_at;
          const bDate = b.createdAt ?? b.created_at;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        });

      if (historyForCreative.length > 0) {
        const latest = historyForCreative[0];
        const lastChanged = historyForCreative.find(
          (h: any) => h.status === "changed"
        );
        statusMap.set(c.id, {
          status: latest.status,
          createdAt: latest.createdAt ?? latest.created_at,
          lastChangedAt: lastChanged
            ? lastChanged.createdAt ?? lastChanged.created_at
            : undefined,
        });
      }
    });

    return statusMap;
  }, [recentCreativeHistory, creatives]);

  const getDaysSinceLastChange = (createdAt: string, lastChangedAt?: string) => {
    const baseDate = lastChangedAt ? new Date(lastChangedAt) : new Date(createdAt);
    const now = new Date();
    const diffTime = now.getTime() - baseDate.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };
  
  // 1時間以内に監視実行されたクリエイティブを判定する関数
  const isCreativeRecentlyMonitored = useMemo(() => {
    const map = new Map<number, boolean>();
    if (!creatives || !recentCreativeHistory || user?.plan === "admin") {
      // 管理者プランは制限なし
      return map;
    }
    
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    creatives.forEach((creative) => {
      const status = creativeStatusMap.get(creative.id);
      if (status?.createdAt) {
        const lastMonitoredAt = new Date(status.createdAt).getTime();
        if (lastMonitoredAt > oneHourAgo) {
          map.set(creative.id, true);
        }
      }
    });
    
    return map;
  }, [creatives, recentCreativeHistory, creativeStatusMap, user?.plan]);
  
  // 1時間以内に監視実行されたクリエイティブの制限メッセージを取得
  const getCreativeRestrictionMessage = (creativeId: number): string | null => {
    if (user?.plan === "admin") return null; // 管理者プランは制限なし
    if (!isCreativeRecentlyMonitored.has(creativeId)) return null;
    
    const status = creativeStatusMap.get(creativeId);
    if (!status?.createdAt) return null;
    
    const lastMonitoredAt = new Date(status.createdAt).getTime();
    const now = Date.now();
    const minutesRemaining = Math.ceil((lastMonitoredAt + 60 * 60 * 1000 - now) / (1000 * 60));
    
    return `同一対象への手動監視は1時間に1回までです。あと${minutesRemaining}分お待ちください。`;
  };

  const handleSort = (
    key: "title" | "url" | "status" | "createdAt" | "lastChangedAt" | "daysSince"
  ) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // デフォルト方向：タイトルは昇順、それ以外は降順
      setSortDirection(key === "title" ? "asc" : "desc");
    }
  };

  const renderSortIcon = (
    key: "title" | "url" | "status" | "createdAt" | "lastChangedAt" | "daysSince"
  ) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-4 h-4 ml-1" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1" />
    );
  };

  const filteredCreatives = useMemo(() => {
    if (!creatives) return [];
    const q = searchQuery.toLowerCase().trim();
    return creatives.filter((c: any) => {
      const title = (c.title ?? "").toLowerCase();
      const url = (c.targetUrl ?? "").toLowerCase();
      const description = (c.description ?? "").toLowerCase();

      const matchesSearch =
        !q || title.includes(q) || url.includes(q) || description.includes(q);

      let matchesTag = true;
      if (selectedTagFilter) {
        const tagSet = creativeTagMap.get(c.id);
        matchesTag = !!tagSet && tagSet.has(selectedTagFilter);
      }

      return matchesSearch && matchesTag;
    });
  }, [creatives, searchQuery, selectedTagFilter, creativeTagMap]);

  const sortedCreatives = useMemo(() => {
    if (!filteredCreatives.length) return [];
    if (!sortKey) return filteredCreatives;
    const list = [...filteredCreatives];

    list.sort((a: any, b: any) => {
      let aValue: any;
      let bValue: any;

      switch (sortKey) {
        case "title":
          aValue = a.title || "";
          bValue = b.title || "";
          return sortDirection === "asc"
            ? aValue.localeCompare(bValue, "ja")
            : bValue.localeCompare(aValue, "ja");
        case "url":
          aValue = a.targetUrl || "";
          bValue = b.targetUrl || "";
          return sortDirection === "asc"
            ? aValue.localeCompare(bValue, "ja")
            : bValue.localeCompare(aValue, "ja");
        case "status": {
          const statusA = creativeStatusMap.get(a.id)?.status;
          const statusB = creativeStatusMap.get(b.id)?.status;
          const order = (status?: string) => {
            if (!status) return 3; // 未監視
            if (status === "error") return 0;
            if (status === "changed") return 1;
            if (status === "ok") return 2;
            return 3;
          };
          aValue = order(statusA);
          bValue = order(statusB);
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }
        case "createdAt":
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        case "lastChangedAt": {
          const lastA =
            creativeStatusMap.get(a.id)?.lastChangedAt || a.createdAt;
          const lastB =
            creativeStatusMap.get(b.id)?.lastChangedAt || b.createdAt;
          aValue = new Date(lastA).getTime();
          bValue = new Date(lastB).getTime();
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }
        case "daysSince":
        default: {
          const statusA = creativeStatusMap.get(a.id);
          const statusB = creativeStatusMap.get(b.id);
          const daysA = getDaysSinceLastChange(
            a.createdAt,
            statusA?.lastChangedAt
          );
          const daysB = getDaysSinceLastChange(
            b.createdAt,
            statusB?.lastChangedAt
          );
          return sortDirection === "asc" ? daysA - daysB : daysB - daysA;
        }
      }
    });

    return list;
  }, [filteredCreatives, creativeStatusMap, sortKey, sortDirection]);

  const handleOpenCreate = () => {
    setFormState({
      title: "",
      imageUrl: "",
      landingPageId: null,
      targetUrl: null,
      description: "",
    });
    setIsAddDialogOpen(true);
  };

  const handleCreate = () => {
    if (!formState.title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    if (!formState.imageUrl.trim()) {
      toast.error("画像URLを入力してください");
      return;
    }

    createMutation.mutate({
      title: formState.title.trim(),
      imageUrl: formState.imageUrl.trim(),
      landingPageId: formState.landingPageId ?? undefined,
      targetUrl: formState.targetUrl?.trim() || undefined,
      description: formState.description?.trim() || undefined,
    });
  };

  const handleOpenEdit = (creative: any) => {
    setEditingCreativeId(creative.id);
    setFormState({
      title: creative.title ?? "",
      imageUrl: creative.imageUrl ?? "",
      landingPageId: creative.landingPageId ?? null,
      targetUrl: creative.targetUrl ?? null,
      description: creative.description ?? "",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = () => {
    if (editingCreativeId == null) return;

    if (!formState.title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    if (!formState.imageUrl.trim()) {
      toast.error("画像URLを入力してください");
      return;
    }

    updateMutation.mutate({
      id: editingCreativeId,
      title: formState.title.trim(),
      imageUrl: formState.imageUrl.trim(),
      landingPageId: formState.landingPageId ?? null,
      targetUrl: formState.targetUrl?.trim() || null,
      description: formState.description?.trim() || null,
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm("このクリエイティブを削除しますか？")) return;
    deleteMutation.mutate({ id });
  };

  const handleMonitor = (id: number) => {
    monitorMutation.mutate({ id });
  };

  // スケジュールから除外クリエイティブのセットを作成（LP管理のロジックに合わせる）
  const excludedCreativeIdsFromSchedule = useMemo(() => {
    const schedule = creativeScheduleQuery.data;
    if (!schedule || !schedule.excludedCreativeIds) {
      return new Set<number>();
    }
    try {
      const ids = JSON.parse(schedule.excludedCreativeIds) as number[];
      return new Set<number>(ids);
    } catch (e) {
      console.error("Failed to parse excludedCreativeIds:", e);
      return new Set<number>();
    }
  }, [creativeScheduleQuery.data]);

  const handleToggleMonitoring = async (creativeId: number, enabled: boolean) => {
    const schedule = creativeScheduleQuery.data;
    if (!schedule) {
      toast.error("まずスケジュール設定画面でクリエイティブのスケジュールを作成してください");
      return;
    }

    let currentExcludedIds: number[] = [];
    if (schedule.excludedCreativeIds) {
      try {
        currentExcludedIds = JSON.parse(
          schedule.excludedCreativeIds
        ) as number[];
      } catch (e) {
        console.error("Failed to parse excludedCreativeIds:", e);
      }
    }

    const excludedSet = new Set(currentExcludedIds);
    if (enabled) {
      excludedSet.delete(creativeId);
    } else {
      excludedSet.add(creativeId);
    }

    const nextExcludedIds = Array.from(excludedSet);

    try {
      await creativeScheduleUpsert.mutateAsync({
        intervalDays: schedule.intervalDays,
        executeHour: schedule.executeHour ?? 9,
        enabled: schedule.enabled,
        excludedCreativeIds: nextExcludedIds,
      });
      toast.success(
        enabled ? "監視設定を有効にしました" : "監視設定を無効にしました"
      );
      creativeScheduleQuery.refetch();
    } catch (error: any) {
      console.error("Failed to update creative schedule monitoring toggle:", error);
      toast.error(error.message || "監視設定の更新に失敗しました");
    }
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
        <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">クリエイティブ管理</h1>
            <p className="text-muted-foreground mt-2">
              バナー広告などのクリエイティブを登録し、変更を監視します
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* 手動監視クォータ表示 */}
            {quotaData && quotaData.maxCount !== null && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                <Clock className="w-4 h-4 text-slate-600" />
                <div className="flex flex-col gap-1 min-w-[140px]">
                  <div className="text-xs text-slate-600">手動監視クォータ</div>
                  <div className="flex items-center gap-2">
                    <Progress 
                      value={quotaData.maxCount > 0 ? (quotaData.currentCount / quotaData.maxCount) * 100 : 0} 
                      className="h-2 flex-1"
                    />
                    <span className="text-xs font-medium text-slate-700 min-w-[50px] text-right">
                      残り{quotaData.remainingCount ?? 0}回
                    </span>
                  </div>
                </div>
              </div>
            )}
            {quotaData && quotaData.maxCount === null && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md">
                <Clock className="w-4 h-4 text-emerald-600" />
                <div className="text-xs text-emerald-700 font-medium">手動監視: 無制限</div>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => monitorAllMutation.mutate()}
              disabled={
                isMonitoringAll ||
                monitorAllMutation.isPending ||
                monitorMutation.isPending ||
                !creatives ||
                creatives.length === 0
              }
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
                <Button onClick={handleOpenCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  クリエイティブ登録
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新しいクリエイティブを登録</DialogTitle>
                  <DialogDescription>
                    監視したいバナー画像のURLなどを登録してください
                  </DialogDescription>
                </DialogHeader>
                {isAtLimit && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-yellow-800">
                        {PLAN_CONFIG[userPlan].name}では、最大{maxCreativeCount}件まで登録できます。
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        現在 {currentCreativeCount}/{maxCreativeCount} 件登録中です。プランをアップグレードすると、より多くのクリエイティブを登録できます。
                      </p>
                    </div>
                  </div>
                )}
                {!isAtLimit && maxCreativeCount !== null && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-sm text-blue-800">
                      {PLAN_CONFIG[userPlan].name}: {currentCreativeCount}/{maxCreativeCount} 件登録中
                    </p>
                  </div>
                )}
                <div className="space-y-4 mt-2">
              <div>
                <Label htmlFor="creative-title" className="mb-2 block">
                  タイトル *
                </Label>
                <Input
                  id="creative-title"
                  value={formState.title}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, title: e.target.value }))
                  }
                  placeholder="クリエイティブのタイトル"
                />
              </div>
              <div>
                <Label htmlFor="creative-image-url" className="mb-2 block">
                  画像URL *
                </Label>
                <Input
                  id="creative-image-url"
                  value={formState.imageUrl}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, imageUrl: e.target.value }))
                  }
                  placeholder="https://example.com/banner.png"
                />
              </div>
              <div>
                <Label htmlFor="creative-description" className="mb-2 block">
                  説明
                </Label>
                <Textarea
                  id="creative-description"
                  value={formState.description ?? ""}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, description: e.target.value }))
                  }
                  placeholder="このクリエイティブについての説明"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="creative-target-url" className="mb-2 block">
                  遷移先URL
                </Label>
                <Input
                  id="creative-target-url"
                  value={formState.targetUrl ?? ""}
                  onChange={(e) =>
                    setFormState((s) => ({ ...s, targetUrl: e.target.value }))
                  }
                  placeholder="https://example.com/lp"
                />
              </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddDialogOpen(false)}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        登録中...
                      </>
                    ) : (
                      "登録"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="タイトル・説明・遷移先URLで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* タグフィルタ（LP管理と同様のUI。対象はクリエイティブ用タグのみ） */}
          {allTags && allTags.length > 0 && (
            <Select
              value={selectedTagFilter?.toString() || "all"}
              onValueChange={(value) =>
                setSelectedTagFilter(value === "all" ? null : parseInt(value))
              }
            >
              <SelectTrigger className="w-[200px] bg-white">
                <SelectValue placeholder="タグで絞り込み" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのタグ</SelectItem>
                {allTags
                  .filter(
                    (tag: any) =>
                      (tag as any).targetType === "creative" ||
                      (tag as any).targetType === undefined
                  )
                  .map((tag: any) => (
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
          {!creatives || creatives.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>登録されているクリエイティブがありません</p>
              <p className="text-sm mt-2">
                右上の「クリエイティブ登録」ボタンから新しいクリエイティブを追加してください
              </p>
            </div>
          ) : !sortedCreatives || sortedCreatives.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>検索条件に一致するクリエイティブがありません</p>
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
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead
                    className="text-center cursor-pointer select-none"
                    onClick={() => handleSort("title")}
                  >
                    <div className="flex items-center justify-center">
                      タイトル {renderSortIcon("title")}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">画像</TableHead>
                  <TableHead
                    className="text-center cursor-pointer select-none"
                    onClick={() => handleSort("url")}
                  >
                    <div className="flex items-center justify-center">
                      遷移先URL {renderSortIcon("url")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer select-none"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center justify-center">
                      ステータス {renderSortIcon("status")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer select-none"
                    onClick={() => handleSort("createdAt")}
                  >
                    <div className="flex items-center justify-center">
                      登録日 {renderSortIcon("createdAt")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer select-none"
                    onClick={() => handleSort("lastChangedAt")}
                  >
                    <div className="flex items-center justify-center">
                      最終変更日 {renderSortIcon("lastChangedAt")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer select-none"
                    onClick={() => handleSort("daysSince")}
                  >
                    <div className="flex items-center justify-center">
                      未変更期間 {renderSortIcon("daysSince")}
                    </div>
                  </TableHead>
                  <TableHead className="text-center">タグ</TableHead>
                  <TableHead className="text-center">説明</TableHead>
                  <TableHead className="text-center">監視</TableHead>
                  <TableHead className="text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCreatives.map((creative: any) => (
                  <TableRow
                    key={creative.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <TableCell className="text-left font-medium">
                      {creative.title || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {creative.imageUrl ? (
                        <div className="flex flex-col items-center gap-2">
                          <a
                            href={creative.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={creative.imageUrl}
                              alt={creative.title || "creative"}
                              className="h-12 w-auto rounded border object-contain bg-white"
                            />
                          </a>
                          <button
                            type="button"
                            onClick={async () => {
                              const text = creative.imageUrl as string;
                              try {
                                if (
                                  typeof navigator !== "undefined" &&
                                  navigator.clipboard &&
                                  navigator.clipboard.writeText
                                ) {
                                  await navigator.clipboard.writeText(text);
                                } else {
                                  const textarea =
                                    document.createElement("textarea");
                                  textarea.value = text;
                                  textarea.style.position = "fixed";
                                  textarea.style.left = "-9999px";
                                  document.body.appendChild(textarea);
                                  textarea.focus();
                                  textarea.select();
                                  document.execCommand("copy");
                                  document.body.removeChild(textarea);
                                }
                                toast.success("画像URLをコピーしました");
                              } catch (e) {
                                console.error("Failed to copy image URL:", e);
                                toast.error(
                                  "画像URLのコピーに失敗しました"
                                );
                              }
                            }}
                          >
                            <Badge
                              variant="outline"
                              className="text-xs cursor-pointer"
                            >
                              画像URL
                            </Badge>
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          なし
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      {creative.targetUrl ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const text = creative.targetUrl as string;
                            try {
                              if (
                                typeof navigator !== "undefined" &&
                                navigator.clipboard &&
                                navigator.clipboard.writeText
                              ) {
                                await navigator.clipboard.writeText(text);
                              } else {
                                // フォールバック: 一時的なtextareaを使ったコピー
                                const textarea = document.createElement(
                                  "textarea"
                                );
                                textarea.value = text;
                                textarea.style.position = "fixed";
                                textarea.style.left = "-9999px";
                                document.body.appendChild(textarea);
                                textarea.focus();
                                textarea.select();
                                document.execCommand("copy");
                                document.body.removeChild(textarea);
                              }
                              toast.success("遷移先URLをコピーしました");
                            } catch (e) {
                              console.error("Failed to copy URL:", e);
                              toast.error(
                                "クリップボードへのコピーに失敗しました"
                              );
                            }
                          }}
                          className="text-blue-600 hover:underline text-sm inline-block max-w-sm truncate"
                          title={creative.targetUrl}
                        >
                          {creative.targetUrl.length > 100
                            ? `${creative.targetUrl.slice(0, 100)}…`
                            : creative.targetUrl}
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          なし
                        </span>
                      )}
                    </TableCell>
                    {/* ステータス */}
                    <TableCell className="text-center">
                      {(() => {
                        if (isRecentCreativeHistoryLoading) {
                          return (
                            <span className="text-sm text-muted-foreground">
                              読み込み中...
                            </span>
                          );
                        }
                        const status = creativeStatusMap.get(creative.id);
                        if (!status) {
                          return (
                            <span className="text-sm text-muted-foreground">
                              未監視
                            </span>
                          );
                        }
                        return (
                          <div className="flex flex-col items-center gap-1">
                            <Badge
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
                                : "エラー"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(status.createdAt).toLocaleDateString(
                                "ja-JP",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }
                              )}
                            </span>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      {creative.createdAt
                        ? new Date(creative.createdAt).toLocaleDateString(
                            "ja-JP",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )
                        : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const status = creativeStatusMap.get(creative.id);
                        const lastChangedAt =
                          status?.lastChangedAt || creative.createdAt;
                        return lastChangedAt
                          ? new Date(lastChangedAt).toLocaleDateString(
                              "ja-JP",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              }
                            )
                          : "-";
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const status = creativeStatusMap.get(creative.id);
                        const days = getDaysSinceLastChange(
                          creative.createdAt,
                          status?.lastChangedAt
                        );
                        return `${days}日`;
                      })()}
                    </TableCell>
                    {/* タグ */}
                    <TableCell className="text-center">
                      <CreativeTagSelector creativeId={creative.id} />
                    </TableCell>
                    {/* 説明 */}
                    <TableCell className="text-left max-w-xs">
                      <span className="text-sm text-muted-foreground break-words whitespace-pre-wrap">
                        {creative.description && creative.description.trim() !== ""
                          ? creative.description
                          : "-"}
                      </span>
                    </TableCell>
                    {/* 監視ON/OFF */}
                    <TableCell className="text-center">
                      <Switch
                        checked={!excludedCreativeIdsFromSchedule.has(
                          creative.id
                        )}
                        onCheckedChange={(checked) =>
                          handleToggleMonitoring(creative.id, checked)
                        }
                        disabled={creativeScheduleUpsert.isPending}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(() => {
                          const isDisabled = monitoringCreativeIds.has(creative.id) || monitorAllMutation.isPending || isCreativeRecentlyMonitored.has(creative.id);
                          const restrictionMessage = getCreativeRestrictionMessage(creative.id);
                          const button = (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMonitor(creative.id)}
                              disabled={isDisabled}
                              title={
                                monitoringCreativeIds.has(creative.id) || monitorAllMutation.isPending
                                  ? "監視実行中..."
                                  : restrictionMessage || "監視を実行"
                              }
                            >
                              <RefreshCw className={`w-4 h-4 ${monitoringCreativeIds.has(creative.id) || monitorAllMutation.isPending ? 'animate-spin' : ''}`} />
                            </Button>
                          );
                          
                          if (restrictionMessage) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {button}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{restrictionMessage}</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          return button;
                        })()}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setLocation(`/history/creative/${creative.id}`)
                          }
                          title="監視履歴を表示"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(creative)}
                          title="編集"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(creative.id)}
                          disabled={deleteMutation.isPending}
                          title="削除"
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

      {/* 編集ダイアログ */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>クリエイティブを編集</DialogTitle>
            <DialogDescription>
              登録済みのクリエイティブ情報を編集します
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label htmlFor="edit-creative-title" className="mb-2 block">
                タイトル *
              </Label>
              <Input
                id="edit-creative-title"
                value={formState.title}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, title: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-creative-image-url" className="mb-2 block">
                画像URL *
              </Label>
              <Input
                id="edit-creative-image-url"
                value={formState.imageUrl}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, imageUrl: e.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-creative-description" className="mb-2 block">
                説明
              </Label>
              <Textarea
                id="edit-creative-description"
                value={formState.description ?? ""}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, description: e.target.value }))
                }
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-creative-target-url" className="mb-2 block">
                遷移先URL
              </Label>
              <Input
                id="edit-creative-target-url"
                value={formState.targetUrl ?? ""}
                onChange={(e) =>
                  setFormState((s) => ({ ...s, targetUrl: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
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
  );
}


