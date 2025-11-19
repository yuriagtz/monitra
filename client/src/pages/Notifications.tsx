import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { Loader2, Mail, MessageSquare, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const initialFormData = {
  emailEnabled: false,
  emailAddress: "",
  slackEnabled: false,
  slackWebhookUrl: "",
  discordEnabled: false,
  discordWebhookUrl: "",
  chatworkEnabled: false,
  chatworkApiToken: "",
  chatworkRoomId: "",
  notifyOnChange: true,
  notifyOnError: true,
  notifyOnBrokenLink: true,
  ignoreFirstViewOnly: false,
};

type FormData = typeof initialFormData;

export default function Notifications() {
  const { data: user } = trpc.auth.me.useQuery();
  const { data: settings, isLoading, refetch } = trpc.notifications.getSettings.useQuery();
  const updateSettings = trpc.notifications.updateSettings.useMutation({
    onError: (error) => {
      toast.error(error.message || "保存に失敗しました");
    },
  });
  const testNotification = trpc.notifications.testNotification.useMutation({
    onError: (error) => {
      toast.error(error.message || "テスト通知の送信に失敗しました");
    },
  });

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [savedData, setSavedData] = useState<FormData>(initialFormData);
  
  // フリープランかどうかを判定
  const isFreePlan = (user?.plan as "free" | "light" | "pro" | "admin") === "free";

  useEffect(() => {
    if (settings) {
      const next = {
        emailEnabled: !!settings.emailEnabled,
        emailAddress: settings.emailAddress || "",
        slackEnabled: isFreePlan ? false : !!settings.slackEnabled,
        slackWebhookUrl: settings.slackWebhookUrl || "",
        discordEnabled: isFreePlan ? false : !!settings.discordEnabled,
        discordWebhookUrl: settings.discordWebhookUrl || "",
        chatworkEnabled: isFreePlan ? false : !!settings.chatworkEnabled,
        chatworkApiToken: settings.chatworkApiToken || "",
        chatworkRoomId: settings.chatworkRoomId || "",
        notifyOnChange: !!settings.notifyOnChange,
        notifyOnError: !!settings.notifyOnError,
        notifyOnBrokenLink: !!settings.notifyOnBrokenLink,
        ignoreFirstViewOnly: !!settings.ignoreFirstViewOnly,
      };
      setFormData(next);
      setSavedData(next);
    }
  }, [settings, isFreePlan]);

  const handleSave = async () => {
    try {
      // フリープランの場合は、Slack/Discord/Chatwork関連のフィールドを除外
      const payload: any = { ...formData };
      if (isFreePlan) {
        // フリープランの場合は、Slack/Discord/Chatwork関連のフィールドを削除
        delete payload.slackEnabled;
        delete payload.slackWebhookUrl;
        delete payload.discordEnabled;
        delete payload.discordWebhookUrl;
        delete payload.chatworkEnabled;
        delete payload.chatworkApiToken;
        delete payload.chatworkRoomId;
      }
      await updateSettings.mutateAsync(payload);
      toast.success("通知設定を保存しました");
      // 全体を保存したので、savedData も現在のフォーム状態で更新
      setSavedData(formData);
      refetch();
    } catch (error: any) {
      // エラーはmutationのonErrorで処理されるが、念のためここでもログを出力
      console.error("保存エラー:", error);
      // onErrorで既にエラーが表示されているので、ここでは何もしない
    }
  };

  const handleTest = async (channel: 'email' | 'slack' | 'discord' | 'chatwork') => {
    try {
      const result = await testNotification.mutateAsync({ 
        channel,
        // メール通知の場合は、入力中のメールアドレスも渡す（未保存でもテスト可能）
        ...(channel === 'email' && formData.emailAddress ? { emailAddress: formData.emailAddress } : {}),
      });
      if (result.success) {
        toast.success(`${channel}のテスト通知を送信しました`);
      } else {
        toast.error(`${channel}の通知送信に失敗しました`);
      }
    } catch (error) {
      toast.error("テスト通知の送信に失敗しました");
    }
  };

  // 各カード単位の「未保存変更あり」判定
  const hasEmailChanges =
    formData.emailEnabled !== savedData.emailEnabled ||
    formData.emailAddress !== savedData.emailAddress;

  const hasSlackChanges =
    formData.slackEnabled !== savedData.slackEnabled ||
    formData.slackWebhookUrl !== savedData.slackWebhookUrl;

  const hasDiscordChanges =
    formData.discordEnabled !== savedData.discordEnabled ||
    formData.discordWebhookUrl !== savedData.discordWebhookUrl;

  const hasChatworkChanges =
    formData.chatworkEnabled !== savedData.chatworkEnabled ||
    formData.chatworkApiToken !== savedData.chatworkApiToken ||
    formData.chatworkRoomId !== savedData.chatworkRoomId;

  const hasConditionChanges =
    formData.notifyOnChange !== savedData.notifyOnChange ||
    formData.notifyOnError !== savedData.notifyOnError ||
    formData.notifyOnBrokenLink !== savedData.notifyOnBrokenLink ||
    formData.ignoreFirstViewOnly !== savedData.ignoreFirstViewOnly;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">通知設定</h1>
        <p className="text-muted-foreground mt-2">
          LPとクリエイティブの通知チャネルと通知条件を設定します
        </p>
      </div>

      {/* Email Notifications */}
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5" />
              <div>
                <CardTitle>メール通知</CardTitle>
                <CardDescription>変更検出時にメールで通知</CardDescription>
              </div>
            </div>
            <Switch
              checked={formData.emailEnabled}
              onCheckedChange={async (checked) => {
                setFormData({ ...formData, emailEnabled: checked });
                try {
                  await updateSettings.mutateAsync({ emailEnabled: checked });
                  const next = { ...savedData, emailEnabled: checked };
                  setSavedData(next);
                  toast.success(`メール通知を${checked ? "有効" : "無効"}にしました`);
                  refetch();
                } catch (error) {
                  toast.error("メール通知の更新に失敗しました");
                }
              }}
            />
          </div>
        </CardHeader>
        {formData.emailEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emailAddress">メールアドレス</Label>
              <Input
                id="emailAddress"
                type="email"
                placeholder="your@email.com"
                value={formData.emailAddress}
                onChange={(e) =>
                  setFormData({ ...formData, emailAddress: e.target.value })
                }
                className="bg-white"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-start sm:gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateSettings.isPending || !hasEmailChanges}
              >
                {updateSettings.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>保存</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest("email")}
                disabled={
                  !formData.emailAddress || testNotification.isPending
                }
                className="bg-white"
              >
                <Send className="w-4 h-4 mr-2" />
                テスト送信
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Slack Notifications */}
      <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5" />
              <div>
                <CardTitle>Slack通知</CardTitle>
                <CardDescription>
                  Incoming WebhookでSlackに通知
                  {isFreePlan && (
                    <span className="block mt-1 text-amber-600">
                      ※ ライトプラン以上でご利用いただけます
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Switch
                    checked={formData.slackEnabled}
                    disabled={isFreePlan}
                    onCheckedChange={async (checked) => {
                      setFormData({ ...formData, slackEnabled: checked });
                      try {
                        await updateSettings.mutateAsync({ slackEnabled: checked });
                        const next = { ...savedData, slackEnabled: checked };
                        setSavedData(next);
                        toast.success(`Slack通知を${checked ? "有効" : "無効"}にしました`);
                        refetch();
                      } catch (error) {
                        // エラーはmutationのonErrorで処理される
                      }
                    }}
                  />
                </span>
              </TooltipTrigger>
              {isFreePlan && (
                <TooltipContent>
                  <p>Slack通知はライトプラン以上でご利用いただけます</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </CardHeader>
        {formData.slackEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="slackWebhook">Webhook URL</Label>
              <Input
                id="slackWebhook"
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={formData.slackWebhookUrl}
                onChange={(e) =>
                  setFormData({ ...formData, slackWebhookUrl: e.target.value })
                }
                className="bg-white"
                disabled={isFreePlan}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-start sm:gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateSettings.isPending || !hasSlackChanges}
              >
                {updateSettings.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>保存</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest("slack")}
                disabled={
                  isFreePlan ||
                  !formData.slackWebhookUrl ||
                  testNotification.isPending ||
                  hasSlackChanges
                }
                className="bg-white"
              >
                <Send className="w-4 h-4 mr-2" />
                テスト送信
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Discord Notifications */}
      <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5" />
              <div>
                <CardTitle>Discord通知</CardTitle>
                <CardDescription>
                  WebhookでDiscordに通知
                  {isFreePlan && (
                    <span className="block mt-1 text-amber-600">
                      ※ ライトプラン以上でご利用いただけます
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Switch
                    checked={formData.discordEnabled}
                    disabled={isFreePlan}
                    onCheckedChange={async (checked) => {
                      setFormData({ ...formData, discordEnabled: checked });
                      try {
                        await updateSettings.mutateAsync({ discordEnabled: checked });
                        const next = { ...savedData, discordEnabled: checked };
                        setSavedData(next);
                        toast.success(`Discord通知を${checked ? "有効" : "無効"}にしました`);
                        refetch();
                      } catch (error) {
                        // エラーはmutationのonErrorで処理される
                      }
                    }}
                  />
                </span>
              </TooltipTrigger>
              {isFreePlan && (
                <TooltipContent>
                  <p>Discord通知はライトプラン以上でご利用いただけます</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </CardHeader>
        {formData.discordEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="discordWebhook">Webhook URL</Label>
              <Input
                id="discordWebhook"
                type="url"
                placeholder="https://discord.com/api/webhooks/..."
                value={formData.discordWebhookUrl}
                onChange={(e) =>
                  setFormData({ ...formData, discordWebhookUrl: e.target.value })
                }
                className="bg-white"
                disabled={isFreePlan}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-start sm:gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateSettings.isPending || !hasDiscordChanges}
              >
                {updateSettings.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>保存</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest("discord")}
                disabled={
                  isFreePlan ||
                  !formData.discordWebhookUrl ||
                  testNotification.isPending ||
                  hasDiscordChanges
                }
                className="bg-white"
              >
                <Send className="w-4 h-4 mr-2" />
                テスト送信
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Chatwork Notifications */}
      <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5" />
              <div>
                <CardTitle>Chatwork通知</CardTitle>
                <CardDescription>
                  Chatwork APIで通知
                  {isFreePlan && (
                    <span className="block mt-1 text-amber-600">
                      ※ ライトプラン以上でご利用いただけます
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Switch
                    checked={formData.chatworkEnabled}
                    disabled={isFreePlan}
                    onCheckedChange={async (checked) => {
                      setFormData({ ...formData, chatworkEnabled: checked });
                      try {
                        await updateSettings.mutateAsync({ chatworkEnabled: checked });
                        const next = { ...savedData, chatworkEnabled: checked };
                        setSavedData(next);
                        toast.success(`Chatwork通知を${checked ? "有効" : "無効"}にしました`);
                        refetch();
                      } catch (error) {
                        // エラーはmutationのonErrorで処理される
                      }
                    }}
                  />
                </span>
              </TooltipTrigger>
              {isFreePlan && (
                <TooltipContent>
                  <p>Chatwork通知はライトプラン以上でご利用いただけます</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </CardHeader>
        {formData.chatworkEnabled && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chatworkToken">APIトークン</Label>
              <Input
                id="chatworkToken"
                type="password"
                placeholder="APIトークンを入力"
                value={formData.chatworkApiToken}
                onChange={(e) =>
                  setFormData({ ...formData, chatworkApiToken: e.target.value })
                }
                className="bg-white"
                disabled={isFreePlan}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chatworkRoom">ルームID</Label>
              <Input
                id="chatworkRoom"
                placeholder="123456789"
                value={formData.chatworkRoomId}
                onChange={(e) =>
                  setFormData({ ...formData, chatworkRoomId: e.target.value })
                }
                className="bg-white"
                disabled={isFreePlan}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-start sm:gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateSettings.isPending || !hasChatworkChanges}
              >
                {updateSettings.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>保存</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest("chatwork")}
                disabled={
                  isFreePlan ||
                  !formData.chatworkApiToken ||
                  !formData.chatworkRoomId ||
                  testNotification.isPending ||
                  hasChatworkChanges
                }
                className="bg-white"
              >
                <Send className="w-4 h-4 mr-2" />
                テスト送信
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Notification Conditions */}
      <Card>
        <CardHeader>
          <CardTitle>通知条件</CardTitle>
          <CardDescription>どのような場合に通知するかを設定</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>変更検出時</Label>
              <p className="text-sm text-muted-foreground">
                LPの内容が変更されたときに通知
              </p>
            </div>
            <Switch
              checked={formData.notifyOnChange}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, notifyOnChange: checked })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>エラー発生時</Label>
              <p className="text-sm text-muted-foreground">
                監視中にエラーが発生したときに通知
              </p>
            </div>
            <Switch
              checked={formData.notifyOnError}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, notifyOnError: checked })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>リンク切れ検出時</Label>
              <p className="text-sm text-muted-foreground">
                LPにアクセスできなくなったときに通知
              </p>
            </div>
            <Switch
              checked={formData.notifyOnBrokenLink}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, notifyOnBrokenLink: checked })
              }
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>ファーストビューのみの変更は除外</Label>
              <p className="text-sm text-muted-foreground">
                上部のみの変更は通知しない
              </p>
            </div>
            <Switch
              checked={formData.ignoreFirstViewOnly}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, ignoreFirstViewOnly: checked })
              }
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateSettings.isPending || !hasConditionChanges}
            >
              {updateSettings.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>保存</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 画面全体の一括保存ボタンは、カード内保存があるため削除 */}
    </div>
  );
}
