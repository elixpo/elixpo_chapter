# ACP registry entry

Crumb is listed in the [ACP agent registry](https://github.com/agentclientprotocol/registry)
so editors can install `crumb acp` directly. The registry follows new GitHub
Releases on its own; this directory is for the first submission and for manual
changes (description, platforms, icon).

- `agent_json.py <tag>` prints `crumb/agent.json` for a published release,
  reading each archive's SHA-256 from the release's `.sha256` assets
  (needs the `gh` CLI).
- `icon.svg` is the registry icon: 16×16, monochrome (`currentColor`), made
  from the site's pixel-art panda (`crumb.elixpo/public/favicon.png`,
  CC-BY-4.0 like the other visual assets) with `make_icon.py`.
- `make_icon.py <favicon.png> <icon.svg> <preview.png>` rebuilds the icon and
  a light/dark/16 px preview sheet (needs Pillow).

To submit: fork `agentclientprotocol/registry`, add `crumb/agent.json` and
`crumb/icon.svg`, and open a pull request; its CI validates the entry and runs
`crumb acp` to check the terminal sign-in.
