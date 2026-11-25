import { AccountsError } from "../core/errors.js";
import type { WebhookHeaders, WebhookVerificationOptions } from "./types.js";

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;
const SIGNATURE_PREFIX = "sha256=";

function verificationError(message: string): AccountsError {
    return new AccountsError("webhook_verification_error", message);
}

function parseTimestamp(timestamp: string): number | null {
    if (!/^\d+$/.test(timestamp)) return null;
    const parsed = Number(timestamp);
    return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseSignature(signature: string): ArrayBuffer | null {
    if (!signature.startsWith(SIGNATURE_PREFIX)) return null;
    const hex = signature.slice(SIGNATURE_PREFIX.length);
    if (!/^[a-fA-F0-9]{64}$/.test(hex)) return null;

    const bytes = new Uint8Array(32);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes.buffer as ArrayBuffer;
}

async function signatureMatches(
    payload: string,
    timestamp: string,
    signature: ArrayBuffer,
    secret: string,
): Promise<boolean> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
    );
    return crypto.subtle.verify(
        "HMAC",
        key,
        signature,
        encoder.encode(`${timestamp}.${payload}`),
    );
}

/**
 * Verifies an inbound webhook using the exact raw request body.
 *
 * The signature covers `${timestamp}.${payload}`. Throws an AccountsError
 * with code `webhook_verification_error` on failure without exposing request
 * contents, the signature, or the secret.
 */
export async function verifyWebhookSignature(
    payload: string,
    headers: WebhookHeaders,
    options: WebhookVerificationOptions,
): Promise<void> {
    const toleranceSeconds =
        options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) {
        throw verificationError("Webhook timestamp tolerance is invalid");
    }

    const requestTime = parseTimestamp(headers.timestamp);
    if (requestTime === null) {
        throw verificationError(
            "Webhook timestamp header is missing or invalid",
        );
    }
    if (Math.abs(Date.now() / 1000 - requestTime) > toleranceSeconds) {
        throw verificationError(
            "Webhook timestamp is outside the allowed tolerance window",
        );
    }

    const signature = parseSignature(headers.signature);
    if (!signature) {
        throw verificationError(
            "Webhook signature header is missing or invalid",
        );
    }
    if (
        !(await signatureMatches(
            payload,
            headers.timestamp,
            signature,
            options.secret,
        ))
    ) {
        throw verificationError("Webhook signature does not match");
    }

    if (options.replayStore) {
        const expiresAtMs = (requestTime + toleranceSeconds) * 1000;
        // Hex case doesn't change the signature bytes, so normalize the key;
        // otherwise re-casing a captured signature would bypass the store.
        const claimed = await options.replayStore.claim(
            headers.signature.toLowerCase(),
            expiresAtMs,
        );
        if (!claimed) {
            throw verificationError("Webhook has already been processed");
        }
    }
}
