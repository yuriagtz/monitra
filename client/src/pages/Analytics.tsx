import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Tabs, TabsContent } from "@/components/ui/tabs";

export default function Analytics() {
  const [activeTab, setActiveTab] = useState<"lp" | "creative">("lp");
  const [selectedLP, setSelectedLP] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<
    "name" | "changes" | "checks" | "rate" | "errorRate" | "lastChange"
  >("changes");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const { data: landingPages } = trpc.landingPages.list.useQuery(undefined, {
    // パフォーマンス最適化: キャッシュ時間を延長
    staleTime: 1000 * 60 * 10, // 10分間は新鮮とみなす
    cacheTime: 1000 * 60 * 30, // 30分間メモリに保持
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const { data: changeFrequency, isLoading: isLoadingFreq } = trpc.analytics.changeFrequency.useQuery(
    undefined,
    {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  );
  const { data: changeTrend, isLoading: isLoadingTrend } = trpc.analytics.changeTrend.useQuery(
    {
      landingPageId: selectedLP === "all" ? undefined : parseInt(selectedLP),
    },
    {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  );

  // クリエイティブ用データ
  const { data: creatives } = trpc.creatives.list.useQuery(undefined, {
    // パフォーマンス最適化: キャッシュ時間を延長
    staleTime: 1000 * 60 * 10, // 10分間は新鮮とみなす
    cacheTime: 1000 * 60 * 30, // 30分間メモリに保持
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  const {
    data: creativeChangeFrequency,
    isLoading: isLoadingCreativeFreq,
  } = trpc.analytics.creativeChangeFrequency.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const [selectedCreative, setSelectedCreative] = useState<string>("all");
  const {
    data: creativeChangeTrend,
    isLoading: isLoadingCreativeTrend,
  } = trpc.analytics.creativeChangeTrend.useQuery(
    {
      creativeId:
        selectedCreative === "all" ? undefined : parseInt(selectedCreative),
    },
    {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    }
  );

  const highlightItems = useMemo(() => {
    if (!changeFrequency) return [];
    return [...changeFrequency].sort((a, b) => b.changes - a.changes).slice(0, 3);
  }, [changeFrequency]);

  const processedFrequency = useMemo(() => {
    if (!changeFrequency) return [];

    let data = changeFrequency.filter((landingPage) => {
      if (!searchTerm) return true;
      const lower = searchTerm.toLowerCase();
      return landingPage.name.toLowerCase().includes(lower) || landingPage.url.toLowerCase().includes(lower);
    });

    const compare = (a: typeof data[number], b: typeof data[number]) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "ja");
        case "checks":
          return a.checks - b.checks;
        case "rate": {
          const rateA = a.checks ? a.changes / a.checks : 0;
          const rateB = b.checks ? b.changes / b.checks : 0;
          return rateA - rateB;
        }
        case "errorRate": {
          return (a.errorRate ?? 0) - (b.errorRate ?? 0);
        }
        case "lastChange": {
          const timeA = a.lastChangeAt ? new Date(a.lastChangeAt).getTime() : 0;
          const timeB = b.lastChangeAt ? new Date(b.lastChangeAt).getTime() : 0;
          return timeA - timeB;
        }
        case "changes":
        default:
          return a.changes - b.changes;
      }
    };

    return data.sort((a, b) => {
      const result = compare(a, b);
      return sortDirection === "asc" ? result : -result;
    });
  }, [changeFrequency, searchTerm, sortKey, sortDirection]);

  const processedCreativeFrequency = useMemo(() => {
    if (!creativeChangeFrequency) return [];

    let data = creativeChangeFrequency.filter((c) => {
      if (!searchTerm) return true;
      const lower = searchTerm.toLowerCase();
      return (
        c.name.toLowerCase().includes(lower) ||
        c.url.toLowerCase().includes(lower)
      );
    });

    const compare = (a: typeof data[number], b: typeof data[number]) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name, "ja");
        case "checks":
          return a.checks - b.checks;
        case "rate": {
          const rateA = a.checks ? a.changes / a.checks : 0;
          const rateB = b.checks ? b.changes / b.checks : 0;
          return rateA - rateB;
        }
        case "errorRate": {
          return (a.errorRate ?? 0) - (b.errorRate ?? 0);
        }
        case "lastChange": {
          const timeA = a.lastChangeAt
            ? new Date(a.lastChangeAt).getTime()
            : 0;
          const timeB = b.lastChangeAt
            ? new Date(b.lastChangeAt).getTime()
            : 0;
          return timeA - timeB;
        }
        case "changes":
        default:
          return a.changes - b.changes;
      }
    };

    return data.sort((a, b) => {
      const result = compare(a, b);
      return sortDirection === "asc" ? result : -result;
    });
  }, [creativeChangeFrequency, searchTerm, sortKey, sortDirection]);

  const formatDate = (value: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection(key === "name" ? "asc" : "desc");
    }
  };

  const renderSortIcon = (key: typeof sortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-4 h-4 ml-1" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1" />
    );
  };

  return (
    <div className="space-y-6" id="analytics-report">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">分析レポート</h1>
          <p className="text-muted-foreground mt-2">
            LPとクリエイティブの監視結果を集計し、傾向を可視化します
          </p>
        </div>
        <div className="flex items-center">
          <div className="flex items-center gap-1 rounded-full bg-muted p-1 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab("lp")}
              className={cn(
                "px-3 py-1.5 rounded-full font-semibold transition-colors",
                activeTab === "lp"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              LP分析
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("creative")}
              className={cn(
                "px-3 py-1.5 rounded-full font-semibold transition-colors",
                activeTab === "creative"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              クリエイティブ分析
            </button>
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "lp" | "creative")}
      >
        <TabsContent value="lp" className="space-y-6">
          {/* Summary KPI */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 最も変更が多いLP（青） */}
        <Card className="border-blue-100 bg-blue-50/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              最も変更が多いLP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {changeFrequency && changeFrequency.length > 0
                ? changeFrequency.reduce((max, landingPage) =>
                    landingPage.changes > max.changes ? landingPage : max
                  ).name
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {changeFrequency && changeFrequency.length > 0
                ? `${
                    changeFrequency.reduce((max, landingPage) =>
                      landingPage.changes > max.changes ? landingPage : max
                    ).changes
                  }回の変更検出`
                : "データなし"}
            </p>
          </CardContent>
        </Card>

        {/* 総チェック回数（緑） */}
        <Card className="border-emerald-100 bg-emerald-50/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              総チェック回数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {changeFrequency
                ? changeFrequency.reduce((sum, lp) => sum + lp.checks, 0)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              全LPの累計チェック数
            </p>
          </CardContent>
        </Card>

        {/* 平均変更検出率（黄色） */}
        <Card className="border-amber-100 bg-amber-50/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              平均変更検出率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {changeFrequency && changeFrequency.length > 0
                ? (
                    (changeFrequency.reduce((sum, landingPage) => sum + landingPage.changes, 0) /
                      changeFrequency.reduce((sum, landingPage) => sum + landingPage.checks, 0)) *
                    100
                  ).toFixed(1)
                : "0"}
              %
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              全チェック中の変更検出割合
            </p>
          </CardContent>
        </Card>

        {/* 平均エラー率（赤） */}
        <Card className="border-rose-100 bg-rose-50/70">
          <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
              平均エラー率
          </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {changeFrequency && changeFrequency.length > 0
                ? (
                    changeFrequency.reduce(
                      (sum, landingPage) => sum + (landingPage.errorRate ?? 0),
                      0
                    ) / changeFrequency.length
                  ).toFixed(1)
                : "0"}
              %
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              全LPの平均エラー発生割合
            </p>
          </CardContent>
        </Card>
          </div>

          {/* Change Trend Chart */}
          <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>変更トレンド</CardTitle>
              <CardDescription>
                {selectedLP === "all"
                  ? "全LPの日別変更検出トレンド"
                  : "選択したLPの日別変更検出トレンド"}
              </CardDescription>
            </div>
            <Select value={selectedLP} onValueChange={setSelectedLP}>
              <SelectTrigger className="w-full md:w-[240px] bg-white">
                <SelectValue placeholder="LPを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのLP</SelectItem>
                {landingPages?.map((landingPage) => (
                  <SelectItem key={landingPage.id} value={landingPage.id.toString()}>
                    {landingPage.title || landingPage.url.substring(0, 40) + "..."}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingTrend ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : changeTrend && changeTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={changeTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) => {
                    const date = new Date(value as string);
                    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <Legend />
                {/* 総チェック回数（緑 = KPIの総チェックカードに合わせる） */}
                <Line
                  type="monotone"
                  dataKey="checks"
                  stroke="#10b981"
                  name="チェック回数"
                  strokeWidth={2}
                />
                {/* 変更検出回数（黄 = 平均変更検出率カードに合わせる） */}
                <Line
                  type="monotone"
                  dataKey="changes"
                  stroke="#f59e0b"
                  name="変更検出回数"
                  strokeWidth={2}
                />
                {/* エラー回数（赤 = 平均エラー率カードに合わせる） */}
                <Line
                  type="monotone"
                  dataKey="errors"
                  stroke="#ef4444"
                  name="エラー回数"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>データがありません</p>
              <p className="text-sm mt-2">監視チェックを実行してデータを蓄積してください</p>
            </div>
          )}
        </CardContent>
          </Card>

          {/* Highlights */}
          <Card>
        <CardHeader>
          <CardTitle>変更LP トップ3</CardTitle>
          <CardDescription>変更回数の多いLPを上位3件まで表示します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {highlightItems.length > 0 ? (
              highlightItems.map((landingPage, index) => {
                const changeRate = landingPage.checks ? ((landingPage.changes / landingPage.checks) * 100).toFixed(1) : "0.0";
                return (
                  <Card key={landingPage.id} className="bg-sky-50 border-sky-200">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-sky-500 text-white">{`#${index + 1}`}</Badge>
                        <Badge variant="secondary">{landingPage.changes}回</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-semibold truncate" title={landingPage.name}>
                        {landingPage.name}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{landingPage.url}</p>
                      <div className="text-sm text-muted-foreground mt-3">
                        変更率 {changeRate}% ・ 最終変更日 {formatDate(landingPage.lastChangeAt)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="py-6 text-center text-muted-foreground">
                データがありません
              </div>
            )}
          </div>
        </CardContent>
          </Card>

          {/* Filters */}
          <Card>
        <CardHeader>
          <CardTitle>LP別詳細一覧</CardTitle>
          <CardDescription>検索と並び替えで詳細を確認できます</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="LP名・URLで検索"
            className="md:max-w-sm bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <div className="rounded-md border">
            {isLoadingFreq ? (
              <div className="py-12 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground inline-block" />
              </div>
            ) : processedFrequency.length > 0 ? (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                  <TableHead
                    onClick={() => handleSort("name")}
                    className="cursor-pointer select-none text-center"
                  >
                    <div className="flex items-center justify-center">
                      LP {renderSortIcon("name")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="w-[120px] text-center cursor-pointer select-none"
                    onClick={() => handleSort("changes")}
                  >
                    <div className="flex items-center justify-center">
                      変更回数 {renderSortIcon("changes")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="w-[120px] text-center cursor-pointer select-none"
                    onClick={() => handleSort("checks")}
                  >
                    <div className="flex items-center justify-center">
                      チェック回数 {renderSortIcon("checks")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="w-[140px] text-center cursor-pointer select-none"
                    onClick={() => handleSort("rate")}
                  >
                    <div className="flex items-center justify-center">
                      変更率 {renderSortIcon("rate")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="w-[140px] text-center cursor-pointer select-none"
                    onClick={() => handleSort("errorRate")}
                  >
                    <div className="flex items-center justify-center">
                      エラー率 {renderSortIcon("errorRate")}
                    </div>
                  </TableHead>
                  <TableHead
                    className="w-[140px] text-center cursor-pointer select-none"
                    onClick={() => handleSort("lastChange")}
                  >
                    <div className="flex items-center justify-center">
                      最終変更日 {renderSortIcon("lastChange")}
                    </div>
                  </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedFrequency.map((landingPage) => {
                    const changeRateValue = landingPage.checks > 0 ? landingPage.changes / landingPage.checks : 0;
                    const changeRate = (changeRateValue * 100).toFixed(1);
                    const isHighChange = changeRateValue >= 0.5;
                    const errorRateValue = landingPage.errorRate ?? 0;
                    const errorRate = errorRateValue.toFixed(1);
                    return (
                      <TableRow
                        key={landingPage.id}
                        className={cn(
                          "hover:bg-muted/30 transition-colors",
                          isHighChange ? "bg-rose-50/70 hover:bg-rose-50" : undefined
                        )}
                      >
                        <TableCell className="text-left">
                          <div className="font-medium truncate">{landingPage.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{landingPage.url}</div>
                        </TableCell>
                        <TableCell className="text-center font-semibold">{landingPage.changes}</TableCell>
                        <TableCell className="text-center">{landingPage.checks}</TableCell>
                        <TableCell className="text-center">{changeRate}%</TableCell>
                        <TableCell className="text-center">{errorRate}%</TableCell>
                        <TableCell className="text-center">{formatDate(landingPage.lastChangeAt)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                条件に一致するLPがありません
              </div>
            )}
          </div>
        </CardContent>
          </Card>
        </TabsContent>

        {/* クリエイティブ分析 */}
        <TabsContent value="creative" className="space-y-6">
          {/* Summary KPI（構成はLPと同じだがクリエイティブデータを使用） */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 最も変更が多いクリエイティブ（青） */}
            <Card className="border-blue-100 bg-blue-50/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  最も変更が多いクリエイティブ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold truncate">
                  {creativeChangeFrequency && creativeChangeFrequency.length > 0
                    ? creativeChangeFrequency.reduce((max, c) =>
                        c.changes > max.changes ? c : max
                      ).name
                    : "-"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {creativeChangeFrequency && creativeChangeFrequency.length > 0
                    ? `${
                        creativeChangeFrequency.reduce((max, c) =>
                          c.changes > max.changes ? c : max
                        ).changes
                      }回の変更検出`
                    : "データなし"}
                </p>
              </CardContent>
            </Card>

            {/* 総チェック回数（緑） */}
            <Card className="border-emerald-100 bg-emerald-50/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  総チェック回数
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {creativeChangeFrequency
                    ? creativeChangeFrequency.reduce(
                        (sum, c) => sum + c.checks,
                        0
                      )
                    : 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  全クリエイティブの累計チェック数
                </p>
              </CardContent>
            </Card>

            {/* 平均変更検出率（黄色） */}
            <Card className="border-amber-100 bg-amber-50/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  平均変更検出率
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {creativeChangeFrequency &&
                  creativeChangeFrequency.length > 0
                    ? (
                        (creativeChangeFrequency.reduce(
                          (sum, c) => sum + c.changes,
                          0
                        ) /
                          creativeChangeFrequency.reduce(
                            (sum, c) => sum + c.checks,
                            0
                          )) *
                        100
                      ).toFixed(1)
                    : "0"}
                  %
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  全チェック中の変更検出割合
                </p>
              </CardContent>
            </Card>

            {/* 平均エラー率（赤） */}
            <Card className="border-rose-100 bg-rose-50/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  平均エラー率
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {creativeChangeFrequency &&
                  creativeChangeFrequency.length > 0
                    ? (
                        creativeChangeFrequency.reduce(
                          (sum, c) => sum + (c.errorRate ?? 0),
                          0
                        ) / creativeChangeFrequency.length
                      ).toFixed(1)
                    : "0"}
                  %
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  全クリエイティブの平均エラー発生割合
                </p>
              </CardContent>
            </Card>
          </div>

          {/* クリエイティブ変更トレンド */}
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>変更トレンド（クリエイティブ）</CardTitle>
                  <CardDescription>
                    {selectedCreative === "all"
                      ? "全クリエイティブの日別変更検出トレンド"
                      : "選択したクリエイティブの日別変更検出トレンド"}
                  </CardDescription>
                </div>
                <Select
                  value={selectedCreative}
                  onValueChange={setSelectedCreative}
                >
                  <SelectTrigger className="w-full md:w-[240px] bg-white">
                    <SelectValue placeholder="クリエイティブを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべてのクリエイティブ</SelectItem>
                    {creatives?.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingCreativeTrend ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : creativeChangeTrend && creativeChangeTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={creativeChangeTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(value) => {
                        const date = new Date(value as string);
                        return `${date.getFullYear()}/${
                          date.getMonth() + 1
                        }/${date.getDate()}`;
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="checks"
                      stroke="#10b981"
                      name="チェック回数"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="changes"
                      stroke="#f59e0b"
                      name="変更検出回数"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="errors"
                      stroke="#ef4444"
                      name="エラー回数"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>データがありません</p>
                  <p className="text-sm mt-2">
                    監視チェックを実行してデータを蓄積してください
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* クリエイティブ別詳細一覧 */}
          <Card>
            <CardHeader>
              <CardTitle>クリエイティブ別詳細一覧</CardTitle>
              <CardDescription>
                検索と並び替えで詳細を確認できます
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="タイトル・URLで検索"
                className="md:max-w-sm bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              <div className="rounded-md border">
                {isLoadingCreativeFreq ? (
                  <div className="py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground inline-block" />
                  </div>
                ) : processedCreativeFrequency.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead
                          onClick={() => handleSort("name")}
                          className="cursor-pointer select-none text-center"
                        >
                          <div className="flex items-center justify-center">
                            クリエイティブ {renderSortIcon("name")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="w-[120px] text-center cursor-pointer select-none"
                          onClick={() => handleSort("changes")}
                        >
                          <div className="flex items-center justify-center">
                            変更回数 {renderSortIcon("changes")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="w-[120px] text-center cursor-pointer select-none"
                          onClick={() => handleSort("checks")}
                        >
                          <div className="flex items-center justify-center">
                            チェック回数 {renderSortIcon("checks")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="w-[140px] text-center cursor-pointer select-none"
                          onClick={() => handleSort("rate")}
                        >
                          <div className="flex items-center justify-center">
                            変更率 {renderSortIcon("rate")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="w-[140px] text-center cursor-pointer select-none"
                          onClick={() => handleSort("errorRate")}
                        >
                          <div className="flex items-center justify-center">
                            エラー率 {renderSortIcon("errorRate")}
                          </div>
                        </TableHead>
                        <TableHead
                          className="w-[140px] text-center cursor-pointer select-none"
                          onClick={() => handleSort("lastChange")}
                        >
                          <div className="flex items-center justify-center">
                            最終変更日 {renderSortIcon("lastChange")}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processedCreativeFrequency.map((c) => {
                        const changeRateValue =
                          c.checks > 0 ? c.changes / c.checks : 0;
                        const changeRate = (changeRateValue * 100).toFixed(1);
                        const errorRateValue = c.errorRate ?? 0;
                        const errorRate = errorRateValue.toFixed(1);
                        return (
                          <TableRow
                            key={c.id}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <TableCell className="text-left">
                              <div className="font-medium truncate">
                                {c.name}
                              </div>
                              <div
                                className="text-xs text-muted-foreground max-w-md md:max-w-2xl truncate"
                                title={c.url}
                              >
                                {c.url}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-semibold">
                              {c.changes}
                            </TableCell>
                            <TableCell className="text-center">
                              {c.checks}
                            </TableCell>
                            <TableCell className="text-center">
                              {changeRate}%
                            </TableCell>
                            <TableCell className="text-center">
                              {errorRate}%
                            </TableCell>
                            <TableCell className="text-center">
                              {formatDate(c.lastChangeAt)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    条件に一致するクリエイティブがありません
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
