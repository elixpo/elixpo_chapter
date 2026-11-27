# Your GitHub contribution graph on the badge

The **Commits** app draws your GitHub contribution graph: the whole year as
a 53-week grid, your active days, current and longest streaks, your
busiest week and your yearly total. It is built into FaleraOS, so there is
nothing to install; this hack makes it show *your* year.

- **Difficulty:** beginner, about 10 minutes
- **You need:** a badge with Wi-Fi, a USB-C cable and
  [falera-cli](../CLI.md#install)

> **About the name.** This page used to promise a "Commits brick-breaker"
> arcade game. That game does not exist yet; only its icon prompt does
> (`prompts/icons/commits_breaker_icon.md`). The last section explains how
> you could build it on top of the same data.

## 1. Tell the badge who you are

Commits reads the owner's GitHub login from the profile. Until it is set,
the app shows a setup hint and fetches nothing.

```bash
falera setup --github-user octocat
```

See [Put your GitHub handle on the badge](github-handle.md) for the rest of
the profile.

## 2. Give it Wi-Fi

```bash
falera wifi connect "Home Net"
```

## 3. Open Commits

Open **Commits** from the apps drawer. The first time, the grid is empty
and the bottom row becomes a progress bar while the badge downloads
`https://github.com/users/<you>/contributions` (one HTTPS request, no token,
about 250 KB), then fills in. The parsed graph is saved on flash, so from
then on the app opens instantly with the last copy.

- **A** refreshes now.
- An automatic refresh starts in the background when the saved copy is
  older than three hours (`GRAPH_TTL_S` in `oreoOS/github.py`), once Wi-Fi
  is up and the boot's quiet period has passed.
- **HOME** goes back to the drawer.

Each day is placed by its date, newest week on the right, shaded by
GitHub's five contribution levels.

## Troubleshooting

- **NO WIFI** or **FAILED** on screen: the download did not finish (weak Wi-Fi, or
  GitHub was slow). The saved graph stays on screen; press **A** to try
  again.
- **Someone else's graph:** the saved copy is tied to a login, so after you
  change `GITHUB_USER` the app fetches yours again.

## Build the brick-breaker yourself

The data is already on the badge. In your own app:

```python
from oreoOS import github

login = github.user("")                 # GITHUB_USER from the profile
days, age_s = github.cached_graph(login)  # [(date, level 0-4, count), ...] or (None, None)
```

Each day with a level above 0 could be a brick. Start from the app
template ([APPS.md](../APPS.md)), draw the bricks with `d.rect`, move the
paddle with `self.os.buttons.is_pressed(api.BTN_LEFT)` in `update(dt)`, and
never fetch from the network in `update` or `draw`: read the cached graph
that Commits saved. When it works, propose it with the
[app form](https://github.com/elixpo/falera/issues/new?template=app_proposal.yml).
