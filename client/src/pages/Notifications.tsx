import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { Loader2, Mail, MessageSquare, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Notifications() {
  const { data: settings, isLoading, refetch } = trpc.notifications.getSettings.useQuery();
  const updateSettings = trpc.notifications.updateSettings.useMutation();
  const testNotification = trpc.notifications.testNotification.useMutation();

  const [formData, setFormData] = useState({
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
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        emailEnabled: !!settings.emailEnabled,
        emailAddress: settings.emailAddress || "",
        slackEnabled: !!settings.slackEnabled,
        slackWebhookUrl: settings.slackWebhookUrl || "",
        discordEnabled: !!settings.discordEnabled,
        discordWebhookUrl: settings.discordWebhookUrl || "",
        chatworkEnabled: !!settings.chatworkEnabled,
        chatworkApiToken: settings.chatworkApiToken || "",
        chatworkRoomId: settings.chatworkRoomId || "",
        notifyOnChange: !!settings.notifyOnChange,
        notifyOnError: !!settings.notifyOnError,
        notifyOnBrokenLink: !!settings.notifyOnBrokenLink,
        ignoreFirstViewOnly: !!settings.ignoreFirstViewOnly,
      });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync(formData);
      toast.success("通知設定を保存しました");
      refetch();
    } catch (error) {
      toast.error("保存に失敗しました");
    }
  };

  const handleTest = async (channel: 'email' | 'slack' | 'discord' | 'chatwork') => {
    try {
      const result = await testNotification.mutateAsync({ channel });
      if (result.success) {
        toast.success(`${channel}のテスト通知を送信しました`);
      } else {
        toast.error(`${channel}の通知送信に失敗しました`);
      }
    } catch (error) {
      toast.error("テスト通知の送信に失敗しました");
    }
  };

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
          LP変更検出時の通知方法を設定します
        </p>
      </div>

      {/* Email Notifications */}
      <Card>
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
              onCheckedChange={(checked) =>
                setFormData({ ...formData, emailEnabled: checked })
              }
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
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTest('email')}
              disabled={!formData.emailAddress || testNotification.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              テスト送信
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Slack Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5" />
              <div>
                <CardTitle>Slack通知</CardTitle>
                <CardDescription>Incoming WebhookでSlackに通知</CardDescription>
              </div>
            </div>
            <Switch
              checked={formData.slackEnabled}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, slackEnabled: checked })
              }
            />
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
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTest('slack')}
              disabled={!formData.slackWebhookUrl || testNotification.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              テスト送信
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Discord Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5" />
              <div>
                <CardTitle>Discord通知</CardTitle>
                <CardDescription>WebhookでDiscordに通知</CardDescription>
              </div>
            </div>
            <Switch
              checked={formData.discordEnabled}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, discordEnabled: checked })
              }
            />
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
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTest('discord')}
              disabled={!formData.discordWebhookUrl || testNotification.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              テスト送信
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Chatwork Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5" />
              <div>
                <CardTitle>Chatwork通知</CardTitle>
                <CardDescription>Chatwork APIで通知</CardDescription>
              </div>
            </div>
            <Switch
              checked={formData.chatworkEnabled}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, chatworkEnabled: checked })
              }
            />
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
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTest('chatwork')}
              disabled={!formData.chatworkApiToken || !formData.chatworkRoomId || testNotification.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              テスト送信
            </Button>
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
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending}>
          {updateSettings.isPending && (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          )}
          設定を保存
        </Button>
      </div>
    </div>
  );
}
