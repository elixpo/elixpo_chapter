-- Elixpo membership and birthday wishes, shared with me.elixpo.com.
--
-- `member` marks people with an Elixpo member portfolio; `portfolio_slug` links the account to
-- https://me.elixpo.com/<slug>. me.elixpo's "Send a wish" button increments `birthday_wishes`
-- through its Pages Function, which binds this database read/write but only runs a single
-- UPDATE ... WHERE portfolio_slug = ? AND member = 1 and the matching SELECT.
-- `birthday_wishes_year` (Asia/Kolkata) resets the count each year.
ALTER TABLE users ADD COLUMN member INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN portfolio_slug TEXT;
ALTER TABLE users ADD COLUMN birthday_wishes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN birthday_wishes_year INTEGER;

-- One account per portfolio. SQLite treats NULLs as distinct, so non-members don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_portfolio_slug ON users(portfolio_slug);

-- Members with a portfolio on me.elixpo.com, matched by the public email in their
-- content/<slug>/profile.json. Members whose account uses another address are linked with:
--   UPDATE users SET member = 1, portfolio_slug = '<slug>' WHERE email = '<account email>';
UPDATE users SET member = 1, portfolio_slug = 'ayushman' WHERE lower(email) = 'ayushman@myceli.ai';
UPDATE users SET member = 1, portfolio_slug = 'anwesha' WHERE lower(email) = 'anwesha@elixpo.com';
UPDATE users SET member = 1, portfolio_slug = 'vivek' WHERE lower(email) = 'vivek@elixpo.com';
UPDATE users SET member = 1, portfolio_slug = 'karan' WHERE lower(email) = '2006karanray@gmail.com';
UPDATE users SET member = 1, portfolio_slug = 'bhumika' WHERE lower(email) = 'bhumikasudarshani@gmail.com';
UPDATE users SET member = 1, portfolio_slug = 'divyanshu' WHERE lower(email) = 'divjha.cloud@gmail.com';
UPDATE users SET member = 1, portfolio_slug = 'nihal' WHERE lower(email) = 'info@nihalgazi.com';
UPDATE users SET member = 1, portfolio_slug = 'krishnendu' WHERE lower(email) = 'krishnendu125dutta@gmail.com';
