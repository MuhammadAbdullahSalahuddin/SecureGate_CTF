import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import bcrypt from "bcrypt";

// PUBLIC registration endpoint — intentionally unlinked from any frontend page.
// Only discoverable via directory/endpoint fuzzing against /api/*.
//
// VULNERABLE: accepts a client-supplied `clearanceCode` and trusts it to
// determine the account's role. The codes are deliberately non-obvious
// (not "role":"ADMIN") — the mapping is never exposed by this API and must
// be discovered externally (OSINT).
const CLEARANCE_MAP: Record<string, string> = {
  "PROV-STANDARD": "OPERATOR",
  "PROV-AUDIT": "AUDITOR",
  "PROV-ROOT": "ADMIN",
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password, clearanceCode } = body;

  if (!email || !password) {
    return NextResponse.json(
      { message: "Email and password required" },
      { status: 400 },
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { message: "Password too short" },
      { status: 400 },
    );
  }

  const existing = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );
  if (existing.rows.length > 0) {
    return NextResponse.json(
      { message: "Email already registered" },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // VULNERABLE: unknown/missing codes silently fall back to OPERATOR —
  // no validation that clearanceCode is something the client should be
  // allowed to set at all.
  const finalRole = CLEARANCE_MAP[clearanceCode] ?? "OPERATOR";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
      [email, passwordHash],
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.name = $2`,
      [userResult.rows[0].id, finalRole],
    );

    await client.query("COMMIT");

    return NextResponse.json(
      { message: "Account created. Please log in." },
      { status: 201 },
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Register error:", err);
    return NextResponse.json(
      { message: "Registration failed" },
      { status: 500 },
    );
  } finally {
    client.release();
  }
}
