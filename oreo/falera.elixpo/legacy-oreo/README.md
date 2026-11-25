# legacy-oreo

What the old Cloudflare Pages project `oreo` serves since the rename to
FaleraOS: a redirect of every path on oreo.elixpo.com and oreo-dw9.pages.dev
to the same path on falera.elixpo.com (301). The first five boards print
oreo.elixpo.com, so keep this project and its custom domain for good.

    cd falera.elixpo
    npx wrangler pages deploy legacy-oreo --project-name=oreo --branch=main

The site itself deploys to the `falera` project (`npm run deploy`).
