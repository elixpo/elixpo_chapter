-- 0010_fundraisers.sql
--
-- Fundraisers (issue #60): a public page with a reason and a goal where anyone
-- can contribute any amount. Contributions are one-time Razorpay orders; when
-- the owner has an active connected payout account the order carries a Route
-- transfer so the money reaches them directly (platform owner settles direct).

CREATE TABLE IF NOT EXISTS fundraisers (
    id                TEXT PRIMARY KEY,               -- fr_xxx
    merchant_id       TEXT NOT NULL REFERENCES merchants(id),
    owner_uid         TEXT NOT NULL,                  -- Elixpo Accounts subject
    owner_name        TEXT,
    owner_avatar      TEXT,
    slug              TEXT NOT NULL UNIQUE,           -- /f/<slug>
    title             TEXT NOT NULL,
    body_md           TEXT NOT NULL DEFAULT '',       -- the reason (limited markdown)
    cover_url         TEXT,
    link_url          TEXT,                           -- optional GitHub / website
    goal_amount       INTEGER NOT NULL,               -- minor units of goal_currency
    goal_currency     TEXT NOT NULL DEFAULT 'INR',
    -- {"INR":[10000,25000,…],"USD":[500,1000,…]} minor units per currency
    presets_json      TEXT NOT NULL,
    thank_you_message TEXT,
    -- draft | live | closed | held
    status            TEXT NOT NULL DEFAULT 'draft',
    moderation_note   TEXT,
    ends_at           TEXT,
    published_at      TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fundraisers_merchant ON fundraisers(merchant_id, created_at);

CREATE TABLE IF NOT EXISTS contributions (
    id                  TEXT PRIMARY KEY,             -- ctb_xxx
    fundraiser_id       TEXT NOT NULL REFERENCES fundraisers(id),
    amount              INTEGER NOT NULL,             -- charged, minor units
    currency            TEXT NOT NULL,                -- charged currency (INR)
    display_amount      INTEGER,                      -- what the visitor picked
    display_currency    TEXT,                         --   e.g. 1000 USD (≈ charged INR)
    fx_rate             REAL,                         -- ₹ per $1 used when display_currency = USD
    name                TEXT,
    show_name           INTEGER NOT NULL DEFAULT 0,
    email               TEXT,                         -- receipt only, never shown
    message             TEXT,
    provider_order_id   TEXT,
    provider_payment_id TEXT,
    -- created | paid | failed
    status              TEXT NOT NULL DEFAULT 'created',
    thanks_email_status TEXT,                         -- sent | queued | failed | skipped
    owner_email_status  TEXT,
    paid_at             TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contributions_order ON contributions(provider_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contributions_payment ON contributions(provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_contributions_fundraiser ON contributions(fundraiser_id, status, paid_at);

CREATE TABLE IF NOT EXISTS fundraiser_reports (
    id             TEXT PRIMARY KEY,                  -- frr_xxx
    fundraiser_id  TEXT NOT NULL REFERENCES fundraisers(id),
    reason         TEXT NOT NULL,
    details        TEXT,
    reporter_email TEXT,
    status         TEXT NOT NULL DEFAULT 'open',      -- open | resolved
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fundraiser_reports ON fundraiser_reports(fundraiser_id, status);
