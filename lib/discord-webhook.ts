// lib/discord-webhook.ts

type Channel = "alerts" | "solves";

const WEBHOOK_URLS: Record<Channel, string | undefined> = {
  alerts: process.env.DISCORD_ALERTS_WEBHOOK_URL,
  solves: process.env.DISCORD_SOLVES_WEBHOOK_URL,
};

interface NotifyOptions {
  channel?: Channel; // defaults to 'alerts'
  color?: number; // Discord embed side color
  mention?: boolean; // prefix with @here (use sparingly — first blood only)
}

export async function notifyDiscord(message: string, opts: NotifyOptions = {}) {
  const { channel = "alerts", color, mention = false } = opts;
  const url = WEBHOOK_URLS[channel];
  if (!url) {
    console.log("[Discord] no webhook URL configured for channel:", channel);
    return;
  }

  const body = color
    ? {
        content: mention ? "@here" : undefined,
        embeds: [{ description: message, color }],
      }
    : { content: mention ? `@here ${message}` : message };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "<no body>");
      console.error("[Discord] webhook rejected:", res.status, text);
    }
  } catch (err) {
    console.error("[Discord] webhook failed:", err);
  }
}
