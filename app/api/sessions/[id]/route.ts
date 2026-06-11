import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { redis } from "@/lib/redis";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  const deleted = await redis.del(`session:${sessionId}`);

  if (deleted === 0) {
    return NextResponse.json(
      { message: "Session not found or already expired" },
      { status: 404 },
    );
  }

  return NextResponse.json({ message: "Session revoked successfully" });
}
