import { SignJWT, importPKCS8, importSPKI, jwtVerify, JWTPayload } from "jose";

const formatPrivateKey = (key: string): string => {
  // If it already has PEM headers, use as-is
  if (key.includes("-----BEGIN")) return key;
  // Otherwise wrap the raw base64 body
  return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
};

const formatPublicKey = (key: string): string => {
  if (key.includes("-----BEGIN")) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
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

// ADD THIS — you'll need it in every protected route
export async function verifyAccessToken(token: string) {
  const publicKey = process.env.GUARDIAN_JWT_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error(
      "Critical Security Error: GUARDIAN_JWT_PUBLIC_KEY is missing.",
    );
  }

  const key = await importSPKI(formatPublicKey(publicKey), "RS256");
  const { payload } = await jwtVerify(token, key);
  return payload; // contains { userId, role, email }
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
