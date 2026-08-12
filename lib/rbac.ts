import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth";
import { recordSecurityEvent } from "@/lib/ctf-audit";
import pool;
// The three roles in SecureGate
export type Role = "ADMIN" | "OPERATOR" | "AUDITOR";

/**
 * Call this at the top of any protected route.
 * Returns the token payload if valid, or a NextResponse error to return immediately.
 *
 * Usage in a route:
 *   const auth = await requireRole(request, ["ADMIN", "OPERATOR"]);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth.userId, auth.role, auth.email are now available
 */
export async function requireRole(request: NextRequest, allowedRoles: Role[]) {
  // 1. Extract Bearer token from Authorization header
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.split(" ")[1];

  // 2. Verify signature and expiry
  let payload;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // 3. Check role is in the allowed list
  const userRole = payload.role as Role;
  if (!allowedRoles.includes(userRole)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (userRole === "ADMIN") {
    setImmediate(async () => {
      try {
        const check = await pool.query(
          `SELECT r.name FROM users u JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id WHERE u.id = $1`,
          [payload.userId],
        );
        if (check.rows[0]?.name !== "ADMIN") {
          await recordSecurityEvent("jwt_forge_detected", {
            email: payload.email,
            endpoint: request.url,
          });
        }
      } catch {}
    });
  }

  // 4. Return the payload — the route now has userId, role, email
  return {
    userId: payload.userId as string,
    role: userRole,
    email: payload.email as string,
  };
}
