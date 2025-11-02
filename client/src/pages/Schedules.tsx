import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Clock, Loader2, Play, Square } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Schedules() {
  const { data: lps } = trpc.lp.list.useQuery();
  const { data: schedules, refetch } = trpc.schedules.list.useQuery();
  const upsertSchedule = trpc.schedules.upsert.useMutation();
  const deleteSchedule = trpc.schedules.delete.useMutation();
  const startSchedule = trpc.schedules.start.useMutation();
  const stopSchedule = trpc.schedules.stop.useMutation();

  const [selectedLp, setSelectedLp] = useState<number | null>(null);
  const [scheduleType, setScheduleType] = useState<"interval" | "cron">("interval");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [cronExpression, setCronExpression] = useState("0 */1 * * *");

  const handleSaveSchedule = async () => {
    if (!selectedLp) {
      toast.error("LPを選択してください");
      return;
    }

    try {
      await upsertSchedule.mutateAsync({
        landingPageId: selectedLp,
        scheduleType,
        intervalMinutes: scheduleType === "interval" ? intervalMinutes : undefined,
        cronExpression: scheduleType === "cron" ? cronExpression : undefined,
        enabled: true,
      });
      toast.success("スケジュールを保存しました");
      refetch();
      setSelectedLp(null);
    } catch (error) {
      toast.error("保存に失敗しました");
    }
  };

  const handleDeleteSchedule = async (landingPageId: number) => {
    try {
      await deleteSchedule.mutateAsync({ landingPageId });
      toast.success("スケジュールを削除しました");
      refetch();
    } catch (error) {
      toast.error("削除に失敗しました");
    }
  };

  const handleToggleSchedule = async (scheduleId: number, enabled: boolean) => {
    try {
      if (enabled) {
        await startSchedule.mutateAsync({ scheduleId });
        toast.success("スケジュールを開始しました");
      } else {
        await stopSchedule.mutateAsync({ scheduleId });
        toast.success("スケジュールを停止しました");
      }
      refetch();
    } catch (error) {
      toast.error("操作に失敗しました");
    }
  };

  const getLpTitle = (lpId: number) => {
    return lps?.find(lp => lp.id === lpId)?.title || "不明";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">スケジュール設定</h1>
        <p className="text-muted-foreground mt-2">
          LP監視の自動実行スケジュールを設定します
        </p>
      </div>

      {/* Add Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>新規スケジュール追加</CardTitle>
          <CardDescription>LPの自動監視スケジュールを設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>監視対象LP</Label>
            <Select value={selectedLp?.toString() || ""} onValueChange={(v) => setSelectedLp(parseInt(v))}>
              <SelectTrigger>
                <SelectValue placeholder="LPを選択" />
              </SelectTrigger>
              <SelectContent>
                {lps?.map((lp) => (
                  <SelectItem key={lp.id} value={lp.id.toString()}>
                    {lp.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>スケジュールタイプ</Label>
            <Select value={scheduleType} onValueChange={(v: "interval" | "cron") => setScheduleType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interval">間隔指定</SelectItem>
                <SelectItem value="cron">Cron式</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scheduleType === "interval" && (
            <div className="space-y-2">
              <Label>監視間隔(分)</Label>
              <Input
                type="number"
                min="1"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(parseInt(e.target.value))}
              />
              <p className="text-sm text-muted-foreground">
                {intervalMinutes}分ごとに監視を実行します
              </p>
            </div>
          )}

          {scheduleType === "cron" && (
            <div className="space-y-2">
              <Label>Cron式</Label>
              <Input
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 */1 * * *"
              />
              <p className="text-sm text-muted-foreground">
                例: "0 */1 * * *" = 毎時0分に実行
              </p>
            </div>
          )}

          <Button onClick={handleSaveSchedule} disabled={upsertSchedule.isPending}>
            {upsertSchedule.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            スケジュールを追加
          </Button>
        </CardContent>
      </Card>

      {/* Schedule List */}
      <Card>
        <CardHeader>
          <CardTitle>設定済みスケジュール</CardTitle>
          <CardDescription>現在設定されている自動監視スケジュール</CardDescription>
        </CardHeader>
        <CardContent>
          {!schedules || schedules.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              スケジュールが設定されていません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>LP</TableHead>
                  <TableHead>タイプ</TableHead>
                  <TableHead>設定</TableHead>
                  <TableHead>最終実行</TableHead>
                  <TableHead>次回実行</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell className="font-medium">
                      {getLpTitle(schedule.landingPageId)}
                    </TableCell>
                    <TableCell>
                      {schedule.scheduleType === "interval" ? "間隔" : "Cron"}
                    </TableCell>
                    <TableCell>
                      {schedule.scheduleType === "interval"
                        ? `${schedule.intervalMinutes}分ごと`
                        : schedule.cronExpression}
                    </TableCell>
                    <TableCell>
                      {schedule.lastRunAt
                        ? new Date(schedule.lastRunAt).toLocaleString("ja-JP")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {schedule.nextRunAt
                        ? new Date(schedule.nextRunAt).toLocaleString("ja-JP")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {schedule.enabled ? (
                          <Play className="w-4 h-4 text-green-500" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                        <span>{schedule.enabled ? "実行中" : "停止中"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!schedule.enabled}
                          onCheckedChange={(checked) =>
                            handleToggleSchedule(schedule.id, checked)
                          }
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteSchedule(schedule.landingPageId)}
                        >
                          削除
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

      {/* Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5" />
            <div>
              <CardTitle>スケジュール実行について</CardTitle>
              <CardDescription>自動監視の仕組み</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• スケジュールは設定した間隔またはCron式に従って自動的に実行されます</p>
          <p>• 監視結果は通常の手動チェックと同様に履歴に記録されます</p>
          <p>• 通知設定が有効な場合、変更検出時に自動的に通知が送信されます</p>
          <p>• スケジュールはいつでも一時停止・再開・削除できます</p>
        </CardContent>
      </Card>
    </div>
  );
}
