-- Razorpay Route v2 onboarding: a linked account (acc_…) gets a Route product
-- configuration (acc_prd_…) whose activation_status Razorpay moves through
-- requested → under_review / needs_clarification → activated. Payouts are split
-- to the creator only once it is "activated" (payout_accounts.status = 'active').
ALTER TABLE payout_accounts ADD COLUMN razorpay_product_id TEXT;
ALTER TABLE payout_accounts ADD COLUMN activation_status TEXT;
-- What Razorpay still needs (needs_clarification), shown to the creator.
ALTER TABLE payout_accounts ADD COLUMN activation_note TEXT;
