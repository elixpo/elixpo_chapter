-- 0011_fundraiser_page_options.sql
--
-- Public-page options for fundraisers:
--   cover_urls_json  up to 6 cover images shown as a slideshow ("[url, …]").
--                    cover_url stays as the first image (social previews,
--                    older readers).
--   cover_autoplay   1 = slides advance on their own, 0 = visitor controls them.
--   display_name     public name shown instead of the account name (e.g. a
--                    legal or project name); NULL = use the account name.
ALTER TABLE fundraisers ADD COLUMN cover_urls_json TEXT;
ALTER TABLE fundraisers ADD COLUMN cover_autoplay INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fundraisers ADD COLUMN display_name TEXT;
