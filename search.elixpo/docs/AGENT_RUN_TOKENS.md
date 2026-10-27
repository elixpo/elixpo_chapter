# Pollinations endpoint-agent authentication

OreoLook supports two deliberately separate authentication modes on
`POST /v1/chat/completions` and `POST /v1/responses`.

## Direct and local mode

Direct clients authenticate to OreoLook with the deployment's static
`API_KEY`. Model and image calls made for those requests use the server-owned
`POLLINATIONS_API_KEY`.

```dotenv
API_KEY=<random OreoLook client secret>
POLLINATIONS_API_KEY=<normal Pollinations API key>
```

This mode is intended for local development, smoke tests, and clients that
call `search.elixpo.com` directly.

## Pollinations delegated-agent mode

Register the community model as an `endpoint_agent`. Pollinations then mints a
short-lived `ag_` run token for each caller and sends it to OreoLook as:

```http
Authorization: Bearer ag_...
```

OreoLook validates the token remotely and uses that same request-local token
for every downstream Pollinations generation. The endpoint does not store,
mint, or request a parent caller key. A delegated request never falls back to
`POLLINATIONS_API_KEY`.

These optional non-secret settings control validation:

```dotenv
POLLINATIONS_TOKEN_VALIDATION_URL=https://enter.pollinations.ai/api/account/key
POLLINATIONS_TOKEN_VALIDATION_TIMEOUT_SECONDS=3
```

Do not add `AGENT_TOKEN`, `AGENT_RUN_TOKEN`, a parent API key, or an
agent-token signing secret to `.env.local`. Pollinations owns token minting and
signature verification.

Agent run tokens are accepted only through the Bearer header. OreoLook rejects
`ag_` values supplied through `X-API-Key` or `?key=`. The legacy `/api/search`
endpoint remains static-key-only.

## Isolation and retention

- The raw token lives only in request-local context.
- Validation cache entries use a SHA-256 token fingerprint and expire with the
  run token.
- Redis response chains and durable conversation lookup are namespaced by the
  remotely validated caller identity.
- `store: false` does not write response-chain or durable conversation state.
- PDFs and images created by delegated runs use an independent random download
  capability; the `ag_` token is never placed in an artifact URL.

## Community-model migration

Change the existing OreoLook listing from a proxy endpoint with a saved bearer
token to `endpoint_agent`. Keep the endpoint base URL as
`https://search.elixpo.com/v1`, remove the saved API bearer token, and retain
the current public model identifier. Pollinations will authenticate each run
with its short-lived delegated token.

Static `API_KEY` support can remain enabled during migration for direct tests;
it is not used by Pollinations endpoint-agent requests.
