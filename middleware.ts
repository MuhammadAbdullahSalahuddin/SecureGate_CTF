import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, importSPKI } from "jose";

const formatPublicKey = (key: string): string => {
  const unescaped = key.replace(/\\n/g, "\n");
  if (unescaped.includes("-----BEGIN")) return unescaped;
  return `-----BEGIN PUBLIC KEY-----\n${unescaped}\n-----END PUBLIC KEY-----`;
};

export async function middleware(request: NextRequest) {
  // 1. Check for the refreshToken cookie
  // As per Security Rule 3, this httpOnly cookie proves the user has an active session
  const refreshToken = request.cookies.get("refreshToken")?.value;

  if (!refreshToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2. Verify the refresh token signature at the edge
  try {
    const publicKeyStr = process.env.GUARDIAN_JWT_PUBLIC_KEY ?? "";
    const formattedKey = formatPublicKey(publicKeyStr);

    // Import the RS256 public key for edge runtime
    const publicKey = await importSPKI(formattedKey, "RS256");

    // Verify the token. If it was tampered with, this throws an error.
    await jwtVerify(refreshToken, publicKey);

    return NextResponse.next();
  } catch (error) {
    // Token is invalid or expired
    console.error("Middleware JWT Verification Failed:", error);

    // Clear the broken cookie and force a re-login
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("refreshToken");
    return response;
  }
}

// 3. The Matcher Configuration
// This is critical! It prevents the middleware from blocking Next.js internal files
// and API routes (which have their own RBAC guards).
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login (the login page itself)
     */
    "/((?!api|_next/static|_next/image|__nextjs|favicon.ico|login).*)",
  ],
};
