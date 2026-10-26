# Lixrl CLI — URL shortener and QR code generator for the terminal

[![npm](https://img.shields.io/npm/v/@elixpo/lixrl-cli.svg)](https://www.npmjs.com/package/@elixpo/lixrl-cli)
[![license](https://img.shields.io/npm/l/@elixpo/lixrl-cli.svg)](https://github.com/elixpo/lixrl.com/blob/main/packages/lixrl-cli/LICENSE)

`@elixpo/lixrl-cli` is the official command-line client for [Lixrl](https://lixrl.com), a free and open source URL shortener. Shorten URLs, create custom short links, generate QR codes, and export click analytics from a terminal, CI job, or agent workflow — a scriptable, open alternative to Bitly, TinyURL, and Dub.

- **Shorten URLs** with custom slugs, titles, tags, and expiry.
- **Generate QR codes** as PNG or SVG, with styles and optional scan tracking.
- **Link analytics**: clicks over time, countries, referrers, and CSV export.
- **Branded subdomains** and scoped **API keys** managed from the shell.
- **Automation-ready**: `--json --no-input` output for CI and scripts.

Full documentation: [lixrl.com/docs/cli](https://lixrl.com/docs/cli)

## Install

Requires Node.js 20 or newer on macOS, Linux, or Windows.

```bash
npm install --global @elixpo/lixrl-cli
```

## Quick start

```bash
lixrl login --open                               # sign in through your browser
lixrl urls create https://example.com/launch     # shorten a URL
lixrl qr https://example.com --output qr.svg     # generate a QR code (SVG, PNG, or JPEG)
lixrl urls analytics <code> --days 30            # view click analytics
```

If the selected profile already has a valid local key, login reuses it. Otherwise, the CLI asks whether to create a scoped key through Elixpo Accounts or paste an existing raw key. The final key is stored in the operating-system keychain. Accounts tokens used during approval remain in memory and are revoked after the exchange.

## Sign in securely

### Browser and device flow

```bash
lixrl login
lixrl whoami
```

When no valid local key exists, choose **Create a new API key** to continue with Accounts device login, or choose **Use an existing API key** to paste a raw key into the masked prompt. Use `lixrl login --new-key --open` to skip the choice and intentionally create a key. The CLI displays a prefilled Accounts URL and one-time code. After identity approval, Lixrl asks you to choose the key name, access level, and optional expiry date. Passwords, browser cookies, and Accounts refresh tokens are never stored by the CLI.

Running `lixrl login` again reuses a valid key already stored for the selected profile. Use `lixrl login --new-key` only when you intentionally want another key. The CLI cannot recover raw values for keys shown in the dashboard because Lixrl stores only hashes; paste the original key value or create a new one. The CLI also cannot revoke account keys during device login. If the allowance is full, revoke one in the browser, wait until its status shows **Revoked**, and then press Enter in the terminal.

### Paste an existing key

```bash
lixrl login --key
```

Create the key at [lixrl.com/profile/keys](https://lixrl.com/profile/keys), then paste its original value into the masked prompt. You can also run plain `lixrl login` and choose option 2. Dashboard key rows cannot reveal a raw key after creation.

Login configuration and Accounts discovery are retried briefly when a network or server failure is transient. If login still fails, the CLI distinguishes Lixrl configuration failures, Accounts timeouts, connection/DNS/TLS failures, HTTP failures, and incompatible authorization metadata instead of reporting every case as an Accounts outage.

For CI, set `LIXRL_API_KEY` through the CI secret store and use `--json --no-input`; never place the key in source files, command arguments, generated content, or logs.

Use `lixrl --help` for the complete command list. `shortner` is provided as a compatibility alias.

## Usage: shorten URLs, generate QR codes, read analytics

```bash
lixrl urls create https://example.com/launch --title "Launch" --tag campaign
lixrl urls list --search launch --json
lixrl urls analytics abc123 --days 30
lixrl urls export --output links.csv
lixrl keys create --name deploy --scopes read,write
lixrl domains claim team
lixrl qr https://example.com --format png --style rounded --output launch.png
lixrl qr https://example.com --track --style aurora --output campaign.svg
```

Deletion, API-key revocation, mapping removal, and file replacement require `--yes`. Use `--json --no-input` for automation.

The interactive terminal uses distinct colors and symbols for successful operations, status information, correctable warnings, and failures. Set `NO_COLOR=1` for plain output. Command names, subcommands, required arguments, and required flags are validated before the CLI reads your keychain or asks you to sign in, so typos return an immediate usage message.

Network requests, browser approvals, keychain writes, and QR rendering show a compact spinner only while that asynchronous operation is pending. Spinner frames are cleared before the final result and are never emitted by `--json`, `--quiet`, or non-interactive output.

## Agent skills

The npm package contains focused skills for link management and QR generation. They are not copied anywhere during installation.

```bash
lixrl skills list
lixrl skills inspect lixrl-links
lixrl skills install lixrl-links
lixrl skills install lixrl-qr
```

`skills install` copies the selected skill into the current Codex skills directory. This keeps the skill version tied to the installed CLI release.

## Links

- Website: [lixrl.com](https://lixrl.com)
- Free QR code generator: [lixrl.com/generate](https://lixrl.com/generate)
- URL shortener API docs: [lixrl.com/docs/api](https://lixrl.com/docs/api)
- Issues: [github.com/elixpo/lixrl.com/issues](https://github.com/elixpo/lixrl.com/issues)
