import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function Analytics() {
  const [selectedLP, setSelectedLP] = useState<string>("all");
  
  const exportToPDF = async () => {
    const element = document.getElementById("analytics-report");
    if (!element) return;

    const canvas = await html2canvas(element, { scale: 2 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const imgWidth = 210;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
    pdf.save(`lp-analytics-report-${new Date().toISOString().split("T")[0]}.pdf`);
  };
  
  const { data: lps } = trpc.lp.list.useQuery(undefined, {
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
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

  return (
    <div className="space-y-6" id="analytics-report">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">分析レポート</h1>
          <p className="text-muted-foreground mt-2">LP監視の統計情報とトレンド分析</p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={exportToPDF}>
            <Download className="w-4 h-4 mr-2" />
            PDFエクスポート
          </Button>
          
          <Select value={selectedLP} onValueChange={setSelectedLP}>
          <SelectTrigger className="w-[250px] bg-white">
            <SelectValue placeholder="LPを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのLP</SelectItem>
            {lps?.map((lp) => (
              <SelectItem key={lp.id} value={lp.id.toString()}>
                {lp.title || lp.url.substring(0, 40) + "..."}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
      </div>

      {/* Change Frequency Chart */}
      <Card>
        <CardHeader>
          <CardTitle>LP別変更頻度</CardTitle>
          <CardDescription>
            各LPの変更検出回数とチェック回数の比較
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingFreq ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : changeFrequency && changeFrequency.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={changeFrequency}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="checks" fill="#3b82f6" name="チェック回数" />
                <Bar dataKey="changes" fill="#ef4444" name="変更検出回数" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>データがありません</p>
              <p className="text-sm mt-2">LPを登録して監視を開始してください</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>変更トレンド</CardTitle>
          <CardDescription>
            {selectedLP === "all" 
              ? "全LPの日別変更検出トレンド" 
              : "選択したLPの日別変更検出トレンド"}
          </CardDescription>
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
                <Line 
                  type="monotone" 
                  dataKey="checks" 
                  stroke="#3b82f6" 
                  name="チェック回数"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="changes" 
                  stroke="#ef4444" 
                  name="変更検出回数"
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

      {/* Statistics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              平均変更検出率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {changeFrequency && changeFrequency.length > 0
                ? (
                    (changeFrequency.reduce((sum, lp) => sum + lp.changes, 0) /
                      changeFrequency.reduce((sum, lp) => sum + lp.checks, 0)) *
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              最も変更が多いLP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {changeFrequency && changeFrequency.length > 0
                ? changeFrequency.reduce((max, lp) =>
                    lp.changes > max.changes ? lp : max
                  ).name
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {changeFrequency && changeFrequency.length > 0
                ? `${
                    changeFrequency.reduce((max, lp) =>
                      lp.changes > max.changes ? lp : max
                    ).changes
                  }回の変更検出`
                : "データなし"}
            </p>
          </CardContent>
        </Card>

        <Card>
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
      </div>
    </div>
  );
}
