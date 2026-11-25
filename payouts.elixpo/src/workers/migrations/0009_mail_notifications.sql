-- 0009_mail_notifications.sql
--
-- Buyer emails via Elixpo Mails (mails.elixpo.com).
--
-- A merchant connects one Elixpo Mails product to their app: for each payment
-- event they paste the Mails trigger URL (https://mails.elixpo.com/v1/hooks/<key>)
-- and the Mails product's signing secret. Elixpo Pay then calls that hook with
-- the buyer's email + template variables, signed with
--   X-Elixpo-Signature: t=<unix>,v1=hmac_sha256(secret, "<t>.<body>")
-- exactly as Mails' /v1/hooks contract expects.

CREATE TABLE IF NOT EXISTS mail_hooks (
    id              TEXT PRIMARY KEY,              -- mhk_xxx
    app_id          TEXT NOT NULL REFERENCES apps(id),
    -- payment.receipt | subscription.cancelled | payment.failed | access.expired
    event           TEXT NOT NULL,
    hook_url        TEXT NOT NULL,
    -- The Elixpo Mails product secret used to sign trigger requests.
    signing_secret  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active', -- active | paused
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(app_id, event)
);

-- One row per attempted buyer email (outcome as reported by Elixpo Mails).
CREATE TABLE IF NOT EXISTS mail_deliveries (
    id              TEXT PRIMARY KEY,              -- mld_xxx
    app_id          TEXT NOT NULL REFERENCES apps(id),
    event           TEXT NOT NULL,
    to_email        TEXT,
    idempotency_key TEXT NOT NULL,
    -- sent | queued | suppressed | failed | skipped
    status          TEXT NOT NULL,
    response_status INTEGER,
    response_body   TEXT,
    mail_delivery_id TEXT,                         -- Elixpo Mails delivery id
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mail_deliveries_app
    ON mail_deliveries(app_id, created_at);
