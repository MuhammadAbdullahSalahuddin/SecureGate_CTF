// lib/ctf-audit.ts
import { getAuditDb } from "@/lib/mongo";
import { notifyDiscord } from "@/lib/discord-webhook";

export type MilestoneType =
  | "recon_first_login"
  | "privilege_escalation"   // ADMIN action by an account whose real Postgres role isn't ADMIN
  | "session_requested"      // JIT ticket issued for MySQL asset
  | "mysql_session_opened"   // tunnel actually opened
  | "flag_submitted";

export async function recordMilestone(
  email: string,
  type: MilestoneType,
  meta: Record<string, unknown> = {},
) {
  const db = await getAuditDb();
  // Idempotent per (email, type) so repeated actions don't spam the feed/DB
  const existing = await db.collection("ctf_milestones").findOne({ email, type });
  if (existing) return;

  await db.collection("ctf_milestones").insertOne({
    email, type, meta, timestamp: new Date(),
  });

  const labels: Record<MilestoneType, string> = {
    recon_first_login: `🔍 ${email} logged in (Stage 1 complete)`,
    privilege_escalation: `🔓 ${email} obtained ADMIN access (Stage 2/3)`,
    session_requested: `🎫 ${email} requested a MySQL session`,
    mysql_session_opened: `🐚 ${email} opened a live MySQL PAM session`,
    flag_submitted: `🚩 ${email} captured the flag!`,
  };
  await notifyDiscord(labels[type]);
}
