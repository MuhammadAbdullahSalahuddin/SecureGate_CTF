import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { pool } from "@/lib/db"; // we'll create this next
import { redis } from "@/lib/redis";
import { recordMilestone } from "@/lib/ctf-audit";
import { recordSecurityEvent } from "@/lib/ctf-audit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 401 },
      );
    }

    const result = await pool.query(
      `SELECT u.id, u.email, u.password_hash, r.name as role
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE u.email = $1`,
      [email],
    );
    const user = result.rows[0];

    if (!user) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 401 },
      );
    }

    // in app/api/auth/login/route.ts, before the bcrypt.compare check
    const attemptsKey = `login_attempts:${email}`;

    const attempts = await redis.incr(attemptsKey);

    if (attempts === 1) await redis.expire(attemptsKey, 300); // 5 min window

    if (attempts > 8) {
      const ip = request.headers.get("x-real-ip") ?? undefined;
      setImmediate(() =>
        recordSecurityEvent("brute_force_lockout", {
          email,
          attempts,
          ip,
        }).catch(() => {}),
      );
      return NextResponse.json(
        { message: "Too many attempts, try again shortly" },
        { status: 429 },
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 401 },
      );
    }

    setImmediate(() => {
      recordMilestone(user.email, "recon_first_login").catch(() => {});
    });

    //Ressting the attempt counter on success
    await redis.del(attemptsKey);

    // Sign BOTH tokens
    const accessToken = await generateAccessToken(
      user.id.toString(),
      user.role,
      user.email,
    );
    const refreshToken = await generateRefreshToken(user.id.toString());

    // Build the response
    const response = NextResponse.json({ accessToken });

    // Attach refresh token as httpOnly cookie — JavaScript cannot read this
    response.cookies.set("refreshToken", refreshToken, {
      httpOnly: true, // invisible to JavaScript — XSS protection
      secure: process.env.NODE_ENV === "production", // HTTPS only in prod
      sameSite: "strict", // blocks cross-site request forgery
      maxAge: 60 * 60 * 24, // 7 days in seconds
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json(
      { message: "Invalid credentials" },
      { status: 401 },
    );
  }
}
