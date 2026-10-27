# Origin TLS files

Before starting Compose, place the Cloudflare Origin CA files here:

- `origin.pem` — certificate for `search.elixpo.com`
- `origin-key.pem` — private key

Keep both files out of Git and run `chmod 600 deploy/tls/origin-key.pem`.
Use Cloudflare SSL/TLS mode **Full (strict)**.
