import { NextRequest, NextResponse } from "next/server";
import { getAuditDb } from "@/lib/mongo";
import { recordFlagSubmission } from "@/lib/ctf-audit";

// PUBLIC endpoint — called from the lore EC2's submit.html form.
// Protected by a shared secret header, not player auth (players submit
// via email + flag string, not a PAM session).
const CORRECT_FLAG = process.env.CTF_FLAG ?? "";
const SUBMIT_KEY = process.env.CTF_SUBMIT_KEY ?? "";

export async function POST(request: NextRequest) {
  // 1. Shared-secret check — embedded in the lore page's submit form,
  //    stops randoms from hitting this API directly to brute-force flags
  const submitKey = request.headers.get("X-CTF-Submit-Key");
  if (!submitKey || submitKey !== SUBMIT_KEY) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { flag, email } = body;

  if (!flag || !email) {
    return NextResponse.json(
      { message: "flag and email required" },
      { status: 400 },
    );
  }

  const db = await getAuditDb();

  // 2. Idempotency — don't let a player double-submit for double points,
  //    and don't let a retry after a network blip register as a new solve
  const existing = await db.collection("ctf_scores").findOne({ email });
  if (existing) {
    return NextResponse.json({
      message: "Already submitted",
      alreadySolved: true,
    });
  }

  // 3. Verify the flag string matches
  if (flag.trim() !== CORRECT_FLAG) {
    return NextResponse.json({ message: "Incorrect flag", correct: false });
  }

  // 4. First blood check — MUST count before inserting this submission,
  //    otherwise every solver would see count === 1 after their own insert
  const solveCountBefore = await db.collection("ctf_scores").countDocuments();
  const firstBlood = solveCountBefore === 0;

  await db.collection("ctf_scores").insertOne({
    email,
    flag,
    solvedAt: new Date(),
    points: 100,
  });

  // 5. Fire-and-forget Discord notification — never block the player's
  //    response on a Discord webhook call succeeding
  setImmediate(() => {
    recordFlagSubmission(email, firstBlood).catch(() => {});
  });

  return NextResponse.json({
    message: firstBlood
      ? "First blood! Flag accepted."
      : "Correct! Flag accepted.",
    correct: true,
    firstBlood,
  });
}

// GET — public scores endpoint, polled by leaderboard.js every 10s
export async function GET() {
  const db = await getAuditDb();
  const scores = await db
    .collection("ctf_scores")
    .find({})
    .sort({ points: -1, solvedAt: 1 })
    .toArray();

  return NextResponse.json({ scores });
}
