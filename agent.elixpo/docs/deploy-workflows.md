# Shared deploy workflows

Every Elixpo project deploys from CI through reusable workflows kept in this repository. No
project should need a laptop to ship. Each repository adds a small caller workflow that picks
the shapes it needs:

| Workflow | Use it for |
| --- | --- |
| `deploy-cloudflare-pages.yml` | Static exports (`out`) and next-on-pages builds (`.vercel/output/static`) |
| `deploy-cloudflare-worker.yml` | Plain Workers and OpenNext apps (`wrangler deploy`) |
| `publish-npm.yml` | npm packages, with provenance; publishes only new versions |
| `publish-vscode.yml` | VS Code extensions; publishes only new versions |

Pages and Worker deploys can also decrypt a sops-encrypted `.env` (`sops-file`), sync chosen
keys from it as runtime secrets, and apply D1 migrations (`d1-database`). Secret selection:

- `secret-keys`: names or globs to sync (`all` or `*` for every key);
- `secret-exclude`: names or globs to leave out (an exact name in `secret-keys` still wins);
- `secret-map`: `TARGET=SOURCE` lines to sync a key under another name;
- `secret-values`: `KEY=value` lines for non-secret constants such as a production URL.

`CLOUDFLARE_*` keys are never synced as runtime secrets.

Wrangler is never taken from "latest": each job uses the repository's locked wrangler when the
working directory has one installed, and otherwise the pinned `wrangler-version` input
(default `4.160.1`). Bump the default deliberately, after a release has been out for a while. Directories without a `package.json`
(plain Workers) skip the npm install and run wrangler through npx.

## Credentials

| Secret | Scope | Used by |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Organization | Pages and Worker deploys |
| `CI_SOPS_AGE_KEY` | Organization (exists) | Decrypting `.env` when `sops-file` is set |
| `NPM_TOKEN` / `VSCE_PAT` | Repositories that publish | npm and VS Code publishing |

For CI to decrypt a repository's `.env`, the public key of `CI_SOPS_AGE_KEY` must be a
recipient in that repository's `.sops.yaml`; re-encrypt with `sops updatekeys .env` after adding it.
`config/token_policy.yaml` keeps these secrets inside the deploy workflows.

## Example caller

```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch: {}
permissions:
  contents: read
jobs:
  site:
    uses: elixpo/agent.elixpo/.github/workflows/deploy-cloudflare-pages.yml@main
    with:
      project-name: lixblogs
      build-command: npx @cloudflare/next-on-pages
      output-directory: .vercel/output/static
      sops-file: .env
      secret-keys: all
      d1-database: lixblogs
    secrets: inherit
```

agent.elixpo deploys itself the same way: `deploy-site.yml` (agent.elixpo.com, including the
festive theme generated from `config/festivals.yaml`) and `deploy-api.yml` (the dashboard Worker,
whose `ELIXPO_DASHBOARD_GITHUB_TOKEN` stays on the Worker and is never overwritten).

## Rollout

1. Add the organization Cloudflare secrets, then merge the workflows; agent.elixpo deploys itself.
2. Manual repositories move first: admin, status, payouts and mails (Pages + sops secrets + D1;
   mails also deploys its SMTP Worker), opensource (OpenNext Worker), and packages (one Pages path).
3. Already-automatic repositories (elixpo, research, me, accounts, blogs, lixrl, crumb, sketch)
   switch their deploy jobs to these workflows; their npm and VS Code jobs move to the publish
   workflows, called only where a repository ships one.
4. Not covered here: falera's site deploy shares `tools/deploy.py` with board flashing and must be split
   first; Kareixo deploys through Vercel and search.elixpo runs on a Docker host.
