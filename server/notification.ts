import type { NotificationSetting } from "../drizzle/schema";
import * as db from "./db";

interface NotificationPayload {
  title: string;
  message: string;
  lpTitle: string;
  lpUrl: string;
  changeType?: string;
  diffImageUrl?: string;
}

export async function sendEmailNotification(
  email: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      console.warn("[Email] SENDGRID_API_KEY or SENDGRID_FROM_EMAIL is not set");
      return false;
    }

    const subject = payload.title || "LP監視通知";
    const textBody =
      `${payload.message}\n\n` +
      `LP: ${payload.lpTitle}\n` +
      `URL: ${payload.lpUrl}\n` +
      (payload.changeType ? `変更タイプ: ${payload.changeType}\n` : "");

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email }],
            subject,
          },
        ],
        from: { email: fromEmail },
        content: [
          {
            type: "text/plain",
            value: textBody,
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[Email] SendGrid API error:", response.status, text);
    }

    return response.ok;
  } catch (error) {
    console.error("[Email] Failed to send:", error);
    return false;
  }
}

export async function sendSlackNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*${payload.title}*`,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: payload.title,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*LP:*\n${payload.lpTitle}`,
              },
              {
                type: "mrkdwn",
                text: `*変更タイプ:*\n${payload.changeType || "不明"}`,
              },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: payload.message,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<${payload.lpUrl}|LPを確認>`,
            },
          },
        ],
      }),
    });
    
    return response.ok;
  } catch (error) {
    console.error("[Slack] Failed to send:", error);
    return false;
  }
}

export async function sendDiscordNotification(
  webhookUrl: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const embed: any = {
      title: payload.title,
      description: payload.message,
      color: payload.changeType?.includes("変更") ? 0xff4444 : 0x3b82f6,
      fields: [
        {
          name: "LP",
          value: payload.lpTitle,
          inline: true,
        },
        {
          name: "変更タイプ",
          value: payload.changeType || "不明",
          inline: true,
        },
        {
          name: "URL",
          value: payload.lpUrl,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    if (payload.diffImageUrl) {
      embed.image = { url: payload.diffImageUrl };
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [embed],
      }),
    });
    
    return response.ok;
  } catch (error) {
    console.error("[Discord] Failed to send:", error);
    return false;
  }
}

export async function sendChatworkNotification(
  apiToken: string,
  roomId: string,
  payload: NotificationPayload
): Promise<boolean> {
  try {
    const message = `[info][title]${payload.title}[/title]${payload.message}\n\nLP: ${payload.lpTitle}\n変更タイプ: ${payload.changeType || "不明"}\nURL: ${payload.lpUrl}[/info]`;
    
    const response = await fetch(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
      {
        method: "POST",
        headers: {
          "X-ChatWorkToken": apiToken,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `body=${encodeURIComponent(message)}`,
      }
    );
    
    return response.ok;
  } catch (error) {
    console.error("[Chatwork] Failed to send:", error);
    return false;
  }
}

export async function sendNotifications(
  settings: NotificationSetting,
  payload: NotificationPayload,
  context: { userId: number; landingPageId?: number; monitoringHistoryId?: number }
): Promise<{ success: boolean; results: Record<string, boolean> }> {
  const results: Record<string, boolean> = {};

  if (settings.emailEnabled && settings.emailAddress) {
    results.email = await sendEmailNotification(settings.emailAddress, payload);
    await db.addNotificationHistoryEntry({
      userId: context.userId,
      landingPageId: context.landingPageId ?? null,
      monitoringHistoryId: context.monitoringHistoryId ?? null,
      channel: "email",
      status: results.email ? "success" : "failed",
    });
  }

  if (settings.slackEnabled && settings.slackWebhookUrl) {
    results.slack = await sendSlackNotification(settings.slackWebhookUrl, payload);
    await db.addNotificationHistoryEntry({
      userId: context.userId,
      landingPageId: context.landingPageId ?? null,
      monitoringHistoryId: context.monitoringHistoryId ?? null,
      channel: "slack",
      status: results.slack ? "success" : "failed",
    });
  }

  if (settings.discordEnabled && settings.discordWebhookUrl) {
    results.discord = await sendDiscordNotification(settings.discordWebhookUrl, payload);
    await db.addNotificationHistoryEntry({
      userId: context.userId,
      landingPageId: context.landingPageId ?? null,
      monitoringHistoryId: context.monitoringHistoryId ?? null,
      channel: "discord",
      status: results.discord ? "success" : "failed",
    });
  }

  if (settings.chatworkEnabled && settings.chatworkApiToken && settings.chatworkRoomId) {
    results.chatwork = await sendChatworkNotification(
      settings.chatworkApiToken,
      settings.chatworkRoomId,
      payload
    );
    await db.addNotificationHistoryEntry({
      userId: context.userId,
      landingPageId: context.landingPageId ?? null,
      monitoringHistoryId: context.monitoringHistoryId ?? null,
      channel: "chatwork",
      status: results.chatwork ? "success" : "failed",
    });
  }

  const success = Object.values(results).some((r) => r);
  return { success, results };
}
