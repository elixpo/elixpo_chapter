import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const source = async (filePath) => readFile(new URL(`../${filePath}`, import.meta.url), 'utf8');

test('PR blog draft workflow declares correct opt-in triggers and minimal permissions', async () => {
  const workflow = await source('.github/workflows/pr-blog-draft.yml');

  // Opt-in triggers
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /contains\(github\.event\.pull_request\.labels\.\*\.name,\s*'blog-draft'\)/);
  assert.match(workflow, /github\.event\.pull_request\.merged == true/);

  // Minimal permissions
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /pull-requests:\s*read/);

  // Scoped secret
  assert.match(workflow, /LIXBLOGS_TOKEN:\s*\${{\s*secrets\.LIXBLOGS_PAT\s*}}/);

  // Publishing must NOT be automated
  assert.doesNotMatch(workflow, /blog publish/);
  assert.doesNotMatch(workflow, /--publish/);
});

test('PR blog draft script Python unit tests: metadata, idempotency, tags, and redaction', () => {
  const pythonScript = path.resolve('.github/scripts/pr_blog_draft.py');

  const pyTest = `
import sys
import unittest
from pr_blog_draft import (
    derive_idempotency_key,
    derive_draft_slug,
    derive_tags,
    extract_pr_metadata,
    generate_markdown_draft,
    find_existing_draft,
    redact_token,
)

class TestPrBlogDraft(unittest.TestCase):
    def test_idempotency_key_format(self):
        key = derive_idempotency_key("elixpo/blogs.elixpo", 302)
        self.assertEqual(key, "elixpo-blogs-elixpo-pr-302")
        self.assertTrue(8 <= len(key) <= 128)
        self.assertTrue(all(c.isalnum() or c in "-_" for c in key))

    def test_idempotency_key_bounds(self):
        short_key = derive_idempotency_key("a", 1)
        self.assertTrue(len(short_key) >= 8)
        long_key = derive_idempotency_key("a" * 200, 99999)
        self.assertTrue(len(long_key) <= 128)

    def test_draft_slug(self):
        self.assertEqual(derive_draft_slug(302), "pr-302")

    def test_tag_derivation(self):
        files = [
            {"filename": "packages/lixblogs-cli/src/commands/blog.js"},
            {"filename": "app/api/v1/blogs/route.js"},
            {"filename": "src/views/WritePage.jsx"},
        ]
        tags = derive_tags(files)
        self.assertIn("engineering", tags)
        self.assertIn("open-source", tags)
        self.assertIn("cli", tags)
        self.assertIn("backend", tags)
        self.assertIn("frontend", tags)
        self.assertLessEqual(len(tags), 5)

    def test_metadata_extraction(self):
        pr = {
            "number": 302,
            "title": "[ELIXPO] Add technical blog draft workflow (#302)",
            "user": {"login": "octocat"},
            "merged_by": {"login": "maintainer"},
            "merged_at": "2026-11-23T12:00:00Z",
            "html_url": "https://github.com/elixpo/blogs.elixpo/pull/302",
            "body": "## What this does\\nConverts a merged PR summary into a reviewable technical draft.\\n\\n## Details\\nUses the LixBlogs CLI.",
        }
        files = [{"filename": "packages/lixblogs-cli/bin/lixblogs.mjs", "additions": 10, "deletions": 2, "status": "modified"}]
        meta = extract_pr_metadata(pr, files, "elixpo/blogs.elixpo")

        self.assertEqual(meta["pr_number"], 302)
        self.assertEqual(meta["clean_title"], "Add technical blog draft workflow (#302)")
        self.assertIn("PR #302", meta["title"])
        self.assertEqual(meta["author"], "octocat")
        self.assertEqual(meta["merged_by"], "maintainer")
        self.assertIn("Converts a merged PR summary", meta["subtitle"])

    def test_generate_markdown_draft(self):
        meta = {
            "pr_number": 302,
            "title": "Technical Blog Draft (PR #302)",
            "clean_title": "Technical Blog Draft",
            "subtitle": "Overview of PR changes",
            "author": "octocat",
            "merged_by": "maintainer",
            "merged_at": "2026-11-23",
            "html_url": "https://github.com/elixpo/blogs.elixpo/pull/302",
            "body": "Implemented CLI draft generation.",
            "files": [{"filename": "cli.js", "status": "modified", "additions": 50, "deletions": 5}],
            "repo": "elixpo/blogs.elixpo",
        }
        md = generate_markdown_draft(meta)
        self.assertIn("# Technical Blog Draft", md)
        self.assertIn("Source Pull Request", md)
        self.assertIn("https://github.com/elixpo/blogs.elixpo/pull/302", md)
        self.assertIn("@octocat", md)
        self.assertIn("cli.js", md)
        # Word count must satisfy minimum draft requirements (>20 words)
        words = md.split()
        self.assertGreater(len(words), 30)

    def test_find_existing_draft(self):
        drafts = [
            {"id": "draft-1", "slug": "other-post", "title": "Other"},
            {"id": "draft-2", "slug": "pr-302", "title": "Technical Post (PR #302)"},
        ]
        found = find_existing_draft(drafts, 302)
        self.assertIsNotNone(found)
        self.assertEqual(found["id"], "draft-2")

        not_found = find_existing_draft(drafts, 999)
        self.assertIsNone(not_found)

    def test_token_redaction(self):
        raw = "Error sending request with token lix_pat_0123456789abcdef0123456789abcdef01234567 to endpoint"
        redacted = redact_token(raw)
        self.assertNotIn("lix_pat_", redacted)
        self.assertIn("[REDACTED_PAT]", redacted)

if __name__ == '__main__':
    unittest.main()
`;

  const result = spawnSync('python', ['-c', pyTest], {
    cwd: path.dirname(pythonScript),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `Python tests failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
});

test('CLI KeychainCredentialStore handles missing @napi-rs/keyring without throwing on import', async () => {
  const result = spawnSync('node', ['packages/lixblogs-cli/bin/lixblogs.mjs', '--help'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `CLI --help failed with status ${result.status}:\n${result.stderr}`);
  assert.match(result.stdout, /lixblogs — LixBlogs CLI/);
});
