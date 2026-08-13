import { SignJWT, importPKCS8, importSPKI, jwtVerify, JWTPayload } from "jose";

const formatPrivateKey = (key: string): string => {
  const unescaped = key.replace(/\\n/g, "\n");
  if (unescaped.includes("-----BEGIN")) return unescaped;
  return `-----BEGIN PRIVATE KEY-----\n${unescaped}\n-----END PRIVATE KEY-----`;
};

const formatPublicKey = (key: string): string => {
  const unescaped = key.replace(/\\n/g, "\n");
  if (unescaped.includes("-----BEGIN")) return unescaped;
  return `-----BEGIN PUBLIC KEY-----\n${unescaped}\n-----END PUBLIC KEY-----`;
};

export async function generateAccessToken(
  userId: string,
  role: string,
  email: string,
) {
  const secretKey = process.env.GUARDIAN_JWT_PRIVATE_KEY;
  if (!secretKey) {
    throw new Error(
      "Critical Security Error: GUARDIAN_JWT_PRIVATE_KEY is missing.",
    );
  }
  const privateKey = await importPKCS8(formatPrivateKey(secretKey), "RS256");
  return new SignJWT({ userId, role, email })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(privateKey);
}

// ─── VULNERABLE — CTF fork only ───────────────────────────────────────────
// Reads the `alg` field straight out of the (unverified) JWT header and
// branches on it. If the header says HS256, it treats the RSA PUBLIC KEY
// bytes as an HMAC-SHA256 secret. Since the public key is exposed at
// /.well-known/jwks.json, anyone can sign their own HS256 token with those
// same bytes and pass verification.
export async function verifyAccessToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed token");
  }

  const header = JSON.parse(
    Buffer.from(parts[0], "base64url").toString("utf8"),
  );
  const alg = header.alg ?? "RS256";

  const publicKeyStr = process.env.GUARDIAN_JWT_PUBLIC_KEY;
  if (!publicKeyStr) {
    throw new Error(
      "Critical Security Error: GUARDIAN_JWT_PUBLIC_KEY is missing.",
    );
  }

  if (alg === "HS256") {
    // Public key PEM string used verbatim as the HMAC secret
    const secret = new TextEncoder().encode(formatPublicKey(publicKeyStr));
    const { payload } = await jwtVerify(token, secret);
    return payload;
  }

  // Normal path — legitimate RS256 tokens
  const key = await importSPKI(formatPublicKey(publicKeyStr), "RS256");
  const { payload } = await jwtVerify(token, key);
  return payload;
}

export async function generateRefreshToken(userId: string) {
  const secretKey = process.env.GUARDIAN_JWT_PRIVATE_KEY;
  if (!secretKey) {
    throw new Error(
      "Critical Security Error: GUARDIAN_JWT_PRIVATE_KEY is missing.",
    );
  }
  const privateKey = await importPKCS8(formatPrivateKey(secretKey), "RS256");
  return new SignJWT({ userId, type: "refresh" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(privateKey);
}
