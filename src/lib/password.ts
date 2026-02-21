import crypto from 'crypto';

/**
 * Password hashing utilities
 * Uses bcrypt-like salting with PBKDF2 for production-grade security
 */

const HASH_ITERATIONS = 100000;
const HASH_ALGORITHM = 'sha256';

/**
 * Hash a password with a random salt
 * Returns: salt:hash format for storage
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, 64, HASH_ALGORITHM)
    .toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash
 */
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
