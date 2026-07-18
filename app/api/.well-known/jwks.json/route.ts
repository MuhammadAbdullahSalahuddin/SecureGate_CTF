// app/api/.well-known/jwks.json/route.ts
import { NextResponse } from "next/server";
import { importSPKI, exportJWK } from "jose";

const formatPublicKey = (key: string): string => {
  if (key.includes("-----BEGIN")) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
};

export async function GET() {
  const publicKeyStr = process.env.GUARDIAN_JWT_PUBLIC_KEY;
  if (!publicKeyStr) {
    return NextResponse.json({ message: "Key not configured" }, { status: 500 });
  }

  const key = await importSPKI(formatPublicKey(publicKeyStr), "RS256");
  const jwk = await exportJWK(key);

  return NextResponse.json({
    keys: [
      {
        ...jwk,
        use: "sig",
        alg: "RS256",
        kid: "securegate-2025",
      },
    ],
  });
}
