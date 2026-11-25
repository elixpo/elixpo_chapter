-- Exact fixed-window rate limits. One row per (bucket, id, window); the count is
-- bumped with an atomic upsert, so concurrent requests can't slip past the limit
-- (unlike the eventually-consistent KV counter it replaces). Expired windows are
-- deleted by the hourly cron.
CREATE TABLE IF NOT EXISTS rate_limits (
    key         TEXT PRIMARY KEY,          -- bucket:id:window
    count       INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL           -- unix seconds
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);
