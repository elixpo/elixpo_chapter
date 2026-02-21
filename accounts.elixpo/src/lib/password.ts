import crypto from 'crypto';
const HASH_ITERATIONS = 100000;
const HASH_ALGORITHM = 'sha256';

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, 64, HASH_ALGORITHM)
    .toString('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const [salt, storedHash] = hash.split(':');
    const computedHash = crypto
      .pbkdf2Sync(password, salt, HASH_ITERATIONS, 64, HASH_ALGORITHM)
      .toString('hex');
    return computedHash === storedHash;
  } catch (error) {
    console.error('[Password] Verification failed:', error);
    return false;
  }
}
