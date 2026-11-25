-- mail.elixpo — paid plans, billed through Elixpo Pay (payouts.elixpo.com).
--
-- Elixpo Pay owns checkout, autopay mandates, renewals and the ledger. Mails
-- mirrors the resulting plan per workspace (tenant) from Elixpo Pay's signed
-- `entitlement.updated` webhook, and records `payment.captured` as invoices.

ALTER TABLE tenants ADD COLUMN plan                 TEXT NOT NULL DEFAULT 'starter';
ALTER TABLE tenants ADD COLUMN billing_cycle        TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE tenants ADD COLUMN billing_currency     TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE tenants ADD COLUMN subscription_status  TEXT NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN current_period_start TEXT;
ALTER TABLE tenants ADD COLUMN current_period_end   TEXT;
ALTER TABLE tenants ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
-- 'elixpo_pay' once a workspace has paid; NULL on the free plan.
ALTER TABLE tenants ADD COLUMN payment_provider     TEXT;
-- Elixpo Pay entitlement version last applied — webhooks can arrive out of
-- order, an older version must never overwrite a newer grant.
ALTER TABLE tenants ADD COLUMN pay_entitlement_version INTEGER NOT NULL DEFAULT 0;
-- Cycle/currency picked at checkout, applied when the grant lands (Elixpo
-- Pay's entitlement payload carries the tier, not the billing interval).
ALTER TABLE tenants ADD COLUMN pending_billing_cycle    TEXT;
ALTER TABLE tenants ADD COLUMN pending_billing_currency TEXT;

CREATE TABLE IF NOT EXISTS invoices (
    id                  TEXT PRIMARY KEY,                 -- inv_xxx
    tenant_id           TEXT NOT NULL REFERENCES tenants(id),
    provider            TEXT NOT NULL,                    -- elixpo_pay
    -- Elixpo Pay transaction id (txn_…) — UNIQUE so a redelivered webhook
    -- never records the same charge twice.
    provider_invoice_id TEXT,
    amount              INTEGER NOT NULL,                 -- in cents / paise
    currency            TEXT NOT NULL,                    -- USD | INR
    status              TEXT NOT NULL,                    -- paid | open | void | uncollectible
    paid_at             TEXT,
    pdf_url             TEXT,
    hosted_invoice_url  TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_provider_ref
    ON invoices(provider, provider_invoice_id);
