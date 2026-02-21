import * as jose from 'jose';
import { createSecretKey } from 'crypto';

export interface JWTPayload {
  sub: string;
  email: string;
  provider?: 'google' | 'github' | 'email';
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}


export async function getSigningKey(): Promise<jose.KeyLike> {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    // Development: Use HS256 with JWT_SECRET
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters for production');
    }
    return createSecretKey(Buffer.from(secret));
  }

  const privateKeyPEM = process.env.JWT_PRIVATE_KEY;
  if (!privateKeyPEM) {
    throw new Error('JWT_PRIVATE_KEY not found in environment');
  }

  return jose.importPKCS8(privateKeyPEM, 'EdDSA');
}

export async function getVerifyingKey(): Promise<jose.KeyLike> {
  const isDev = process.env.NODE_ENV === 'development';

  if (isDev) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not found in environment');
    }
    return createSecretKey(Buffer.from(secret));
  }

  const publicKeyPEM = process.env.JWT_PUBLIC_KEY;
  if (!publicKeyPEM) {
    throw new Error('JWT_PUBLIC_KEY not found in environment');
  }

  return jose.importSPKI(publicKeyPEM, 'EdDSA');
}

export async function createAccessToken(
  userId: string,
  email: string,
  provider?: 'google' | 'github' | 'email',
  expiresInMinutes: number = 15
): Promise<string> {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    email,
    type: 'access',
    ...(provider && { provider }),
  };

  const key = await getSigningKey();
  const isDev = process.env.NODE_ENV === 'development';

  const jwt = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: isDev ? 'HS256' : 'EdDSA' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInMinutes}m`)
    .sign(key);

  return jwt;
}


export async function createRefreshToken(
  userId: string,
  provider?: 'google' | 'github' | 'email',
  expiresInDays: number = 30
): Promise<string> {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: userId,
    email: '', 
    type: 'refresh',
    ...(provider && { provider }),
  };

  const key = await getSigningKey();
  const isDev = process.env.NODE_ENV === 'development';

  const jwt = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: isDev ? 'HS256' : 'EdDSA' })
    .setIssuedAt()
    .setExpirationTime(`${expiresInDays}d`)
    .sign(key);

  return jwt;
}


export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const key = await getVerifyingKey();
    const isDev = process.env.NODE_ENV === 'development';

    const verified = await jose.jwtVerify(token, key, {
      algorithms: [isDev ? 'HS256' : 'EdDSA'],
    });

    return verified.payload as unknown as JWTPayload;
  } catch (error) {
    console.error('[JWT] Verification failed:', error);
    return null;
  }
}
