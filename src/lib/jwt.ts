import jose from 'jose';


export interface JWTPayload {
  sub: string; 
  email: string;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}


export async function signJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInMinutes: number = 15
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await jose.jwtVerify(
    new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + expiresInMinutes * 60)
      .sign(new TextEncoder().encode(secret)),
    new TextEncoder().encode(secret)
  );
  return JSON.stringify(jwt);
}


export async function createAccessToken(
  userId: string,
  email: string,
  secret: string,
  expiresInMinutes: number = 15
): Promise<string> {
  const payload: JWTPayload = {
    sub: userId,
    email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInMinutes * 60,
    type: 'access',
  };

  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(secret));
}

export async function createRefreshToken(
  userId: string,
  secret: string,
  expiresInDays: number = 30
): Promise<string> {
  const payload: JWTPayload = {
    sub: userId,
    email: '', // refresh tokens don't need email
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60,
    type: 'refresh',
  };

  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(secret));
}

export async function verifyJWT(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const verified = await jose.jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    return verified.payload as JWTPayload;
  } catch (error) {
    return null;
  }
}
