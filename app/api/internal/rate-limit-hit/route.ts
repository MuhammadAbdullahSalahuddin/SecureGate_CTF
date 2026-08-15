// app/api/internal/rate-limit-hit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { recordSecurityEvent } from "@/lib/ctf-audit";

async function handleRateLimitHit(request: NextRequest) {
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for") ??
    "unknown";
  const path = request.nextUrl.searchParams.get("path") ?? "unknown";

  setImmediate(() => {
    recordSecurityEvent("rate_limit_hit", { ip, path }).catch(() => {});
  });

  return NextResponse.json({ message: "Too many requests" }, { status: 429 });
}

export const GET = handleRateLimitHit;
export const POST = handleRateLimitHit;
