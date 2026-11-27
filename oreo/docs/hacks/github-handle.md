# Put your GitHub handle on the badge

The **Badge** app turns the screen into a conference badge: your name, your
title, `@your-handle` and a GitHub card with your location, bio and repo,
follower and following counts. Nothing is set by default, so a fresh badge
shows a setup card instead of someone else's profile. This hack fills it in.

- **Difficulty:** beginner, about 5 minutes
- **You need:** a badge, a USB-C cable, [falera-cli](../CLI.md#install), and
  Wi-Fi on the badge for the GitHub card (your name and title work without it)

## 1. Connect the badge

Plug the badge into your computer and check that `falera` finds it:

```bash
falera doctor
```

If it does not, [USB.md](../USB.md) covers ports and Linux permissions.

## 2. Set your profile

The profile is a small file on the badge, `/profile.json`. `falera setup`
writes it for you. Either answer the questions:

```bash
falera setup
```

or give the values directly:

```bash
falera setup --github-user octocat --name "Mona Lisa" --designation "Firmware @ Example"
```

The keys behind these options are the same names you would put in
`.env.local`:

| Key | What the Badge app does with it |
|---|---|
| `GITHUB_USER` | `@handle` under your name, and the GitHub card |
| `DISPLAY_NAME` | Your name, in the large font (falls back to your GitHub name, then the login) |
| `DISPLAY_DESIGNATION` | The line under your name (`DESIGNATION` is accepted as the older name) |

If you keep them in an `.env`-style file, `falera setup --from-file .env.local`
takes only the profile keys and leaves everything else in the file alone.
Names must be short plain ASCII: the badge font has no other characters.

`falera setup` restarts FaleraOS when it is done, so the apps read the new
profile.

## 3. Give it Wi-Fi

The GitHub card comes from GitHub's public API, fetched by the badge
itself. Add a network once:

```bash
falera wifi connect "Home Net"
```

The badge only uses Wi-Fi for the internet; everything from your computer
goes over USB.

## 4. Open Badge

Open **Badge** from the apps drawer. Your name and title show at once. The
GitHub card is cached on flash, so after the first fetch it draws
immediately, Wi-Fi or not. It refreshes in the background when the copy is
older than six hours (`PROFILE_TTL_S` in `oreoOS/github.py`), or when you
press **A**.

## 5. Your avatar

`falera setup` also puts your GitHub avatar in the round frame. Your computer
downloads it, shrinks it to a 56x56 circle and copies it over USB to
`/avatar.bin` on the badge, so the badge needs no Wi-Fi for it. The file
remembers which GitHub user it belongs to: Badge shows it only for your
`GITHUB_USER`, and draws your initials otherwise. It is kept through FaleraOS
updates and deploys.

Changed your picture on GitHub? Fetch it again:

```bash
falera setup --avatar
```

If setup printed "no avatar" (offline, or a typo in the user name), fix
that and run the same command. `--no-avatar` skips the download.

## Troubleshooting

- **Only a setup card:** neither `GITHUB_USER` nor `DISPLAY_NAME` is set.
  `falera setup --show` prints what the badge has and where each value came
  from.
- **Initials instead of your photo:** `falera setup --show` names whose
  avatar is on the badge; `falera setup --avatar` fetches yours.
- **No GitHub card:** the badge is offline, or GitHub's limit of 60
  unauthenticated requests an hour per network was reached. The card
  appears after the next successful refresh.
- **Developers:** apps read the profile with
  `oreoOS.profile.get("GITHUB_USER")`; see [PROFILE.md](../PROFILE.md).

## See also

- [PROFILE.md](../PROFILE.md): every profile key and where the badge looks
  for it
- [CLI.md: falera setup](../CLI.md#falera-setup-owner-profile)
