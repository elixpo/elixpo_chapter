import crypto from 'crypto';

/**
 * Generate a cryptographically secure random string
 */
export function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate PKCE code_verifier and code_challenge
 * @returns { verifier: string, challenge: string }
 */
export function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = generateRandomString(32);
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return { verifier, challenge };
}

/**
 * Hash a string using SHA-256
 */
export function hashString(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Generate a random state parameter for OAuth
 */
export function generateState(): string {
  return generateRandomString(32);
}

/**
 * Generate a nonce for OpenID Connect flows
 */
export function generateNonce(): string {
  return generateRandomString(16);
}

/**
 * Generate a unique ID (UUID v4)
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}
