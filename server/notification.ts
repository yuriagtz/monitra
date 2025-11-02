import type { NotificationSetting } from "../drizzle/schema";

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
    // TODO: Implement email sending (using nodemailer or similar)
    console.log(`[Email] Sending to ${email}:`, payload);
    return true;
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
  payload: NotificationPayload
): Promise<{ success: boolean; results: Record<string, boolean> }> {
  const results: Record<string, boolean> = {};
  
  if (settings.emailEnabled && settings.emailAddress) {
    results.email = await sendEmailNotification(settings.emailAddress, payload);
  }
  
  if (settings.slackEnabled && settings.slackWebhookUrl) {
    results.slack = await sendSlackNotification(settings.slackWebhookUrl, payload);
  }
  
  if (settings.discordEnabled && settings.discordWebhookUrl) {
    results.discord = await sendDiscordNotification(settings.discordWebhookUrl, payload);
  }
  
  if (settings.chatworkEnabled && settings.chatworkApiToken && settings.chatworkRoomId) {
    results.chatwork = await sendChatworkNotification(
      settings.chatworkApiToken,
      settings.chatworkRoomId,
      payload
    );
  }
  
  const success = Object.values(results).some(r => r);
  return { success, results };
}
