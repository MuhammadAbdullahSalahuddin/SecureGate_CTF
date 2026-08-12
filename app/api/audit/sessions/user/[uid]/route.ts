// app/api/audit/sessions/user/[uid]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { getAuditDb } from "@/lib/mongo";
import { recordSecurityEvent } from "@/lib/ctf-audit";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> },
) {
  // Auth check exists — but doesn't verify uid belongs to the caller.
  // Why does this look "safe" at a glance? Because requireRole runs and
  // genuinely rejects unauthenticated requests — the flaw is purely in
  // object-level authorization, not authentication.
  const auth = await requireRole(request, ["ADMIN", "OPERATOR", "AUDITOR"]);
  if (auth instanceof NextResponse) return auth;

  const { uid } = await params;
  if (uid !== auth.userId) {
    setImmediate(() =>
      recordSecurityEvent("idor_detected", {
        email: auth.email,
        endpoint: request.url,
      }).catch(() => {}),
    );
  }
  const db = await getAuditDb();

  // VULNERABLE: uid comes straight from the URL, never checked against
  // auth.userId. Compare to /api/audit/sessions/route.ts, which correctly
  // uses auth.userId for OPERATOR role.
  const sessions = await db
    .collection("audit_events")
    .aggregate([
      {
        $match: {
          type: { $in: ["session_start", "session_end"] },
          userId: uid,
        },
      },
      {
        $group: {
          _id: "$sessionId",
          sessionId: { $first: "$sessionId" },
          assetId: { $first: "$assetId" },
          startedAt: {
            $min: {
              $cond: [{ $eq: ["$type", "session_start"] }, "$timestamp", null],
            },
          },
          endedAt: {
            $max: {
              $cond: [{ $eq: ["$type", "session_end"] }, "$timestamp", null],
            },
          },
        },
      },
      { $sort: { startedAt: -1 } },
    ])
    .toArray();

  return NextResponse.json({ sessions, userId: uid });
}
