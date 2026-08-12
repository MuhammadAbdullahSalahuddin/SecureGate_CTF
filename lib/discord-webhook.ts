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
  if (!url) return;

  const body = color
    ? {
        content: mention ? "@here" : undefined,
        embeds: [{ description: message, color }],
      }
    : { content: mention ? `@here ${message}` : message };

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[Discord] webhook failed:", err);
  }
}
