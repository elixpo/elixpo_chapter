/** Headers required to verify an inbound Elixpo Accounts webhook. */
export interface WebhookHeaders {
    /** Value of X-Elixpo-Signature (`sha256=<hex>`). */
    signature: string;
    /** Value of X-Elixpo-Timestamp (Unix seconds). */
    timestamp: string;
}

/**
 * Atomic replay-protection store implemented by the consumer with KV, Redis,
 * or a database. `claim` must return false when the key already exists.
 */
export interface ReplayStore {
    claim(key: string, expiresAtMs: number): Promise<boolean> | boolean;
}

export interface WebhookVerificationOptions {
    /** The signing secret returned when the webhook endpoint was created. */
    secret: string;
    /** Maximum timestamp drift in seconds. Defaults to 300 (5 minutes). */
    toleranceSeconds?: number;
    /** Optional atomic store used to reject a signature seen before. */
    replayStore?: ReplayStore;
}
