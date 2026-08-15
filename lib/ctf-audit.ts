// lib/ctf-audit.ts
import { getAuditDb } from "@/lib/mongo";
import { notifyDiscord } from "@/lib/discord-webhook";

export type MilestoneType =
  | "recon_first_login"
  | "privilege_escalation"
  | "session_requested"
  | "mysql_session_opened"
  | "flag_submitted";

const COLORS = {
  info: 0x3b82f6,
  warn: 0xf59e0b,
  danger: 0xef4444,
  success: 0x10b981,
  gold: 0xfacc15,
};

export async function recordMilestone(
  email: string,
  type: MilestoneType,
  meta: Record<string, unknown> = {},
) {
  const db = await getAuditDb();
  const existing = await db
    .collection("ctf_milestones")
    .findOne({ email, type });
  if (existing) return;

  await db
    .collection("ctf_milestones")
    .insertOne({ email, type, meta, timestamp: new Date() });

  const labels: Record<MilestoneType, string> = {
    recon_first_login: `🔍 ${email} logged in`,
    privilege_escalation: `🔓 ${email} obtained ADMIN access`,
    session_requested: `🎫 ${email} requested a MySQL session`,
    mysql_session_opened: `🐚 ${email} opened a live MySQL PAM session`,
    flag_submitted: `🚩 ${email} captured the flag!`,
  };

  await notifyDiscord(labels[type], {
    channel: "solves",
    color: COLORS.success,
  });
}

// ─── Security events — NOT idempotent, every occurrence logged ────────────
// These are attack-surface activity, not player progress. Spam is a feature
// here (you want to see repeated brute-force bursts), so no dedup.

export type SecurityEventType =
  | "brute_force_lockout"
  | "rate_limit_hit"
  | "jwt_forge_detected"
  | "idor_detected"
  | "mass_assignment_detected";

export async function recordSecurityEvent(
  type: SecurityEventType,
  meta: Record<string, unknown> = {},
) {
  console.log("[ctf-audit] recordSecurityEvent called:", type, meta); // TEMP DEBUG
  const db = await getAuditDb();
  await db
    .collection("ctf_security_events")
    .insertOne({ type, meta, timestamp: new Date() });

  const label = (() => {
    switch (type) {
      case "brute_force_lockout":
        return `🔒 Brute force lockout — \`${meta.email}\` (${meta.attempts} attempts${meta.ip ? ` from \`${meta.ip}\`` : ""})`;
      case "rate_limit_hit":
        return `⚡ Rate limit hit — \`${meta.ip}\` on \`${meta.path}\``;
      case "jwt_forge_detected":
        return `🔓 JWT forgery — \`${meta.email}\` on \`${meta.endpoint}\``;
      case "idor_detected":
        return `🕵️ IDOR attempted — \`${meta.email}\` on \`${meta.endpoint}\``;
      case "mass_assignment_detected":
        return `📝 Mass assignment — \`${meta.email}\` via \`${meta.endpoint}\``;
    }
  })();

  await notifyDiscord(label, { channel: "alerts", color: COLORS.danger });
}

// ─── Flag submission — separate from milestones because it needs
// first-blood detection, which requires knowing solve count first ─────────

export async function recordFlagSubmission(email: string, firstBlood: boolean) {
  const db = await getAuditDb();
  const existing = await db
    .collection("ctf_milestones")
    .findOne({ email, type: "flag_submitted" });
  if (existing) return;

  await db.collection("ctf_milestones").insertOne({
    email,
    type: "flag_submitted",
    meta: { firstBlood },
    timestamp: new Date(),
  });

  if (firstBlood) {
    await notifyDiscord(
      `🩸 **FIRST BLOOD!** \`${email}\` captured the flag first!`,
      {
        channel: "solves",
        color: COLORS.gold,
        mention: true,
      },
    );
  } else {
    await notifyDiscord(`🚩 \`${email}\` captured the flag!`, {
      channel: "solves",
      color: COLORS.success,
    });
  }
}
