# Contributing to Elixpo

Thank you for your interest in contributing! Elixpo is built in the open by a
community of 45+ contributors, and we welcome developers, designers, writers,
and first-time contributors alike. This guide is the **standard** used across
every Elixpo repository.

## Ways to contribute

- **Code** - fix a bug, build a feature, improve performance or accessibility.
- **Docs** - improve guides, READMEs, or inline comments.
- **Design & brand** - icons, illustrations, and assets (see `brand/MASCOT.md`).
- **Triage** - reproduce issues, suggest labels, help others in Discussions.
- **Ideas** - propose features in [GitHub Discussions](https://github.com/orgs/elixpo/discussions).

## Before you start

1. Read the [Code of Conduct](CODE_OF_CONDUCT.md) - it applies everywhere.
2. Look for issues labelled **good first issue** or **help wanted**.
3. For anything non-trivial, open or comment on an issue first so we can align
   before you invest time.

## Workflow

1. **Fork** the repository and create a branch from `main`:
   `git checkout -b feat/short-description`
2. **Make your change.** Match the existing code style and keep commits focused.
3. **Test it.** Run the same quality gate used by pull requests:
   ```bash
   npm ci
   npm test
   npm run pages:build
   ```
4. **Open a pull request** with a clear title and description of what changed
   and why. Link any related issue.
5. A maintainer will review. Address feedback, and once approved we merge.

## What automation reviews

Pull requests to `main` receive one fork-safe quality gate. It installs from the
lockfile, runs the test suite, and builds with the same Cloudflare Pages adapter
used before production. These checks need no repository secrets, so external
contributors can receive useful validation without receiving deployment access.

Pull requests from branches in `elixpo/blogs.elixpo` also receive a temporary
Cloudflare Pages preview after the quality gate passes. Fork pull requests do
not receive a remote preview because deployment credentials are never exposed
to code from a fork. A maintainer can reproduce the branch in a trusted context
when a visual preview is needed.

Preview and production are separate decisions. A preview publishes only the
Pages output and does not apply remote database migrations, deploy Workers, or
publish packages. Production deployment remains in the merge-to-`main`
workflow after automated checks and human review are complete.

## Commit & PR conventions

- Write clear, present-tense commit messages (e.g. `fix: handle empty roster`).
- Keep pull requests small and single-purpose where possible.
- Update docs and tests alongside code changes.

## Licensing of contributions

By submitting a contribution you agree it is licensed inbound under the Elixpo
standard (**MIT** for code, **CC-BY-4.0** for assets) and that you have the
right to submit it. The
[Developer Certificate of Origin](https://developercertificate.org) applies to
every commit. We do not require a CLA. See [LICENSE](LICENSE) and
[NOTICE](LICENSES/NOTICE) for details, including the reserved Elixpo/Oreo brand.

## Questions?

Open a thread in [Discussions](https://github.com/orgs/elixpo/discussions) or
email **hello@elixpo.com**. We're glad you're here.
