import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { pool } from "@/lib/db";

// DELETE /api/admin/users/:id — delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole(request, ["ADMIN"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = params;

  // Prevent admin from deleting themselves
  if (auth.userId === id) {
    return NextResponse.json(
      { message: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  const result = await pool.query(
    `DELETE FROM users WHERE id = $1 RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    return NextResponse.json(
      { message: "User not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: "User deleted successfully" });
}