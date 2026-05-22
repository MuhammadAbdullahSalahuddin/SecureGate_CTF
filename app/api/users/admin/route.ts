import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { pool } from "@/lib/db";
import bcrypt from "bcrypt";

// GET /api/admin/users — list all users with their roles
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const result = await pool.query(
    `SELECT u.id, u.email, u.created_at, r.name as role
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     ORDER BY u.created_at DESC`
  );

  return NextResponse.json({ users: result.rows });
}

// POST /api/admin/users — create a new user
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { email, password, role } = body;

  if (!email || !password || !role) {
    return NextResponse.json(
      { message: "email, password, and role are required" },
      { status: 400 }
    );
  }

  const validRoles = ["ADMIN", "OPERATOR", "AUDITOR"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ message: "Invalid role" }, { status: 400 });
  }

  // Check if email already exists
  const existing = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    [email]
  );
  if (existing.rows.length > 0) {
    return NextResponse.json(
      { message: "Email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Insert user and assign role in a transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at`,
      [email, passwordHash]
    );
    const newUser = userResult.rows[0];

    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.id FROM roles r WHERE r.name = $2`,
      [newUser.id, role]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      { user: { ...newUser, role } },
      { status: 201 }
    );
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create user error:", err);
    return NextResponse.json(
      { message: "Failed to create user" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}