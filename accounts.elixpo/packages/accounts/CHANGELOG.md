# Changelog

## 1.1.0

- Add `@elixpo/accounts/webhooks`: `verifyWebhookSignature` for inbound
  app webhooks (HMAC-SHA256 over `${timestamp}.${body}`, `sha256=` hex),
  timestamp tolerance (default 5 minutes), and an optional atomic
  `ReplayStore`.
- Add the `webhook_verification_error` error code.

## 1.0.1

- Add typed OAuth/OIDC discovery.
- Add S256 PKCE, state, nonce, and authorization callback helpers.
- Add authorization-code exchange, refresh rotation, and revocation.
- Add EdDSA JWKS-based access and ID token verification.
- Add sanitized typed errors for protocol, OAuth, network, and verification failures.
