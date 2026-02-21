interface RateLimitEntry {
    count: number;
    resetAt: number;
}

class RateLimiter {
    private store: Map<string, RateLimitEntry> = new Map();
    private windowMs: number;
    private maxRequests: number;

    constructor(windowMs: number = 60000, maxRequests: number = 10) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
    }

    isAllowed(key: string): boolean {
        const now = Date.now();
        const entry = this.store.get(key);

        if (!entry || now > entry.resetAt) {
            this.store.set(key, {
                count: 1,
                resetAt: now + this.windowMs,
            });
            return true;
        }

        if (entry.count < this.maxRequests) {
            entry.count++;
            return true;
        }

        return false;
    }

    getRemaining(key: string): number {
        const now = Date.now();
        const entry = this.store.get(key);

        if (!entry || now > entry.resetAt) {
            return this.maxRequests;
        }

        return Math.max(0, this.maxRequests - entry.count);
    }

    getResetTime(key: string): number {
        const now = Date.now();
        const entry = this.store.get(key);

        if (!entry || now > entry.resetAt) {
            return 0;
        }

        return Math.max(0, entry.resetAt - now);
    }

    clear(): void {
        this.store.clear();
    }

    cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        this.store.forEach((entry, key) => {
            if (now > entry.resetAt) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach((key) => this.store.delete(key));
    }
}

export const loginRateLimiter = new RateLimiter(60000, 10);
export const registerRateLimiter = new RateLimiter(60000, 5);
export const passwordResetRateLimiter = new RateLimiter(60000, 3);

setInterval(() => {
    loginRateLimiter.cleanup();
    registerRateLimiter.cleanup();
    passwordResetRateLimiter.cleanup();
}, 5 * 60 * 1000);

export { RateLimiter };
