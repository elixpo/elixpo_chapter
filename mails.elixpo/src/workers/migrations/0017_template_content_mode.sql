-- 0017_template_content_mode.sql
--
-- Raw-HTML templates. 'editor' (default): the lixeditor document in
-- content_json is the source of truth and content_html is re-rendered from it
-- on every save. 'html': content_html IS the source of truth (hand-written or
-- pasted HTML), content_json is NULL, and the editor never rewrites it — so
-- custom styling survives edits.
ALTER TABLE templates ADD COLUMN content_mode TEXT NOT NULL DEFAULT 'editor';
