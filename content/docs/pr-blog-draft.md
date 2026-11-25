# Automated PR Blog Draft Workflow

The PR Blog Draft workflow (`.github/workflows/pr-blog-draft.yml`) converts a merged pull request summary into a reviewable technical Markdown draft on LixBlogs via the CLI.

Draft creation is opt-in and does not publish automatically. All generated posts remain in `draft` status until reviewed and published by an author or team member.

## Triggering the workflow

The workflow runs only when explicitly requested:

1. **Pull request label (automatic upon merge):** Add the `blog-draft` label to a pull request. When the PR is merged into `main`, the workflow executes.
2. **Manual dispatch (`workflow_dispatch`):** Go to **Actions → PR Blog Draft → Run workflow** and supply:
   - `pr_number` (required): the pull request number.
   - `publication` (optional): `personal` (default) or `org:<id>`.
   - `collection` (optional): target collection ID if publishing to an organization collection.
   - `dry_run` (optional): validate inputs and preview draft output without writing to the API.

## Configuration & Credentials

### Secret Name

- **`LIXBLOGS_PAT`**: Stored in GitHub Repository or Organization Secrets.

### Required API Scopes

Create a Personal Access Token in **LixBlogs → Settings → API** with the following minimum scopes:

- `lixblogs:blog:read` — list existing drafts and verify story URLs.
- `lixblogs:blog:write` — create and update the technical blog draft.

> **Security Note:** The publishing scope `lixblogs:blog:publish` is **not** granted or required. Automated workflows cannot publish posts directly.

### GitHub Workflow Permissions

The workflow declares minimal read-only repository permissions:

```yaml
permissions:
  contents: read
  pull-requests: read
  issues: read
```

## Idempotency and Safe Reruns

- **Idempotency Key:** The CLI and script derive an idempotency key from the repository and PR number (`<owner>-<repo>-pr-<number>`).
- **Deterministic Slug:** Drafts use the slug `pr-<number>`.
- **Duplicate Prevention:** If the workflow is re-run for a PR whose draft already exists, the workflow detects the existing draft and updates its Markdown content and metadata instead of creating duplicate posts.

## Fork Behavior

- GitHub Actions withholds repository secrets (including `LIXBLOGS_PAT`) from pull requests originating from forks.
- If a fork pull request with the `blog-draft` label is merged, the workflow detects the absence of `LIXBLOGS_PAT`, logs an informative warning, and exits cleanly (`exit 0`).
- Maintainers can subsequently generate the draft for the merged fork PR using `workflow_dispatch`.

## Security & Secret Masking

- `LIXBLOGS_PAT` is injected exclusively into the `LIXBLOGS_TOKEN` environment variable of the CLI process.
- The script automatically registers an Actions secret mask (`::add-mask::`) and redacts token patterns from error logs.
- PR metadata and changed-file paths are retrieved via GitHub REST API without executing any contributor-supplied code or scripts.

## Workflow Summary Output

Each successful run posts a Markdown summary to GitHub Actions (`$GITHUB_STEP_SUMMARY`) and sets step outputs:

- `draft_id`: unique LixBlogs blog identifier.
- `draft_url`: preview and editor URL (`https://blogs.elixpo.com/...`).
- `action`: `created` or `updated`.

## Failure Recovery

- **Token Expired / Missing Scopes:** If the CLI exits with an authentication error, generate a new token with `lixblogs:blog:read` and `lixblogs:blog:write` in **Settings → API**, update `LIXBLOGS_PAT` in GitHub Secrets, and re-run the workflow.
- **API Unavailability / Rate Limits:** Re-running the workflow is safe at any time; the idempotency key and draft locator prevent duplicate stories.
