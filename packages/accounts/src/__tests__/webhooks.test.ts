import { describe, expect, it } from "vitest";
import type { AccountsError } from "../core/errors.js";
import type { ReplayStore, WebhookHeaders } from "../webhooks/types.js";
import { verifyWebhookSignature } from "../webhooks/verify.js";

const SECRET = "test-webhook-secret-value-1234567890";

async function sign(
    payload: string,
    timestamp: string,
    secret = SECRET,
): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const value = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`${timestamp}.${payload}`),
    );
    const hex = Array.from(new Uint8Array(value))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    return `sha256=${hex}`;
}

function timestamp(offsetSeconds = 0): string {
    return String(Math.floor(Date.now() / 1000) + offsetSeconds);
}

async function headersFor(
    payload: string,
    at = timestamp(),
    secret = SECRET,
): Promise<WebhookHeaders> {
    return { signature: await sign(payload, at, secret), timestamp: at };
}

class InMemoryReplayStore implements ReplayStore {
    private readonly seen = new Set<string>();

    claim(key: string): boolean {
        if (this.seen.has(key)) return false;
        this.seen.add(key);
        return true;
    }
}

describe("verifyWebhookSignature", () => {
    const payload = JSON.stringify({ event: "user.deleted", user_id: "1" });

    it("accepts a valid signature", async () => {
        await expect(
            verifyWebhookSignature(payload, await headersFor(payload), {
                secret: SECRET,
            }),
        ).resolves.toBeUndefined();
    });

    it("rejects a tampered payload", async () => {
        const headers = await headersFor(payload);
        await expect(
            verifyWebhookSignature(`${payload} `, headers, { secret: SECRET }),
        ).rejects.toMatchObject({ code: "webhook_verification_error" });
    });

    it("rejects a wrong secret", async () => {
        const headers = await headersFor(payload, timestamp(), "wrong-secret");
        await expect(
            verifyWebhookSignature(payload, headers, { secret: SECRET }),
        ).rejects.toMatchObject({ code: "webhook_verification_error" });
    });

    it("rejects malformed and length-mismatched signatures", async () => {
        await expect(
            verifyWebhookSignature(
                payload,
                { signature: "sha256=abcd", timestamp: timestamp() },
                { secret: SECRET },
            ),
        ).rejects.toMatchObject({ code: "webhook_verification_error" });
    });

    it("rejects a missing signature", async () => {
        await expect(
            verifyWebhookSignature(
                payload,
                { signature: "", timestamp: timestamp() },
                { secret: SECRET },
            ),
        ).rejects.toMatchObject({ code: "webhook_verification_error" });
    });

    it("rejects a stale timestamp", async () => {
        const at = timestamp(-600);
        await expect(
            verifyWebhookSignature(payload, await headersFor(payload, at), {
                secret: SECRET,
            }),
        ).rejects.toMatchObject({ code: "webhook_verification_error" });
    });

    it("accepts a timestamp within a custom tolerance", async () => {
        const at = timestamp(-600);
        await expect(
            verifyWebhookSignature(payload, await headersFor(payload, at), {
                secret: SECRET,
                toleranceSeconds: 900,
            }),
        ).resolves.toBeUndefined();
    });

    it("rejects an invalid timestamp", async () => {
        await expect(
            verifyWebhookSignature(
                payload,
                { signature: "", timestamp: "not-a-time" },
                { secret: SECRET },
            ),
        ).rejects.toMatchObject({ code: "webhook_verification_error" });
    });

    it("rejects timestamp tampering", async () => {
        const headers = await headersFor(payload);
        headers.timestamp = timestamp(1);
        await expect(
            verifyWebhookSignature(payload, headers, { secret: SECRET }),
        ).rejects.toMatchObject({ code: "webhook_verification_error" });
    });

    it("does not leak secrets or signatures in errors", async () => {
        const signature = `sha256=${"0".repeat(64)}`;
        try {
            await verifyWebhookSignature(
                payload,
                { signature, timestamp: timestamp() },
                { secret: SECRET },
            );
            throw new Error("expected verification to fail");
        } catch (error) {
            const message = (error as AccountsError).message;
            expect(message).not.toContain(SECRET);
            expect(message).not.toContain(signature);
        }
    });

    it("atomically rejects a replay when a store is supplied", async () => {
        const headers = await headersFor(payload);
        const replayStore = new InMemoryReplayStore();
        const options = { secret: SECRET, replayStore };

        await expect(
            verifyWebhookSignature(payload, headers, options),
        ).resolves.toBeUndefined();
        await expect(
            verifyWebhookSignature(payload, headers, options),
        ).rejects.toMatchObject({ code: "webhook_verification_error" });
    });

    it("rejects a replay that only changes the signature hex case", async () => {
        const headers = await headersFor(payload);
        const replayStore = new InMemoryReplayStore();
        const options = { secret: SECRET, replayStore };

        await verifyWebhookSignature(payload, headers, options);
        const recased = {
            ...headers,
            signature: `sha256=${headers.signature.slice(7).toUpperCase()}`,
        };
        await expect(
            verifyWebhookSignature(payload, recased, options),
        ).rejects.toMatchObject({ code: "webhook_verification_error" });
    });

    it("permits repeated verification without a replay store", async () => {
        const headers = await headersFor(payload);
        const options = { secret: SECRET };
        await verifyWebhookSignature(payload, headers, options);
        await expect(
            verifyWebhookSignature(payload, headers, options),
        ).resolves.toBeUndefined();
    });
});
