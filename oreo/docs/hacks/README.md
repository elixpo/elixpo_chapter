# Badge hacks

Short, step-by-step recipes for making the Falera badge yours. Each one is
checked against the code in this repository: every command, file and key it
names exists. They are also published on the website at
[falera.elixpo.com/hacks](https://falera.elixpo.com/hacks/), rendered from these
files when the site is built.

| Hack | Level | What you end up with |
|---|---|---|
| [Put your GitHub handle on the badge](github-handle.md) | beginner | Badge shows your name, title, `@handle` and GitHub card (`falera setup`) |
| [Add your photo to the Gallery](gallery-photo.md) | beginner | A photo or short video in Gallery, sent with Transfer or `falera add` |
| [Your contribution graph on the badge](commits-brick.md) | beginner | The Commits app showing your GitHub year, streaks and totals |
| [Theme the OS in your colours](custom-theme.md) | beginner | Your palette in `oreoOS/theme.py` |
| [Beam a booth code with IR Quest](ir-quest.md) | intermediate | One badge sending an IR code, another receiving it (see #48) |
| [Tilt to scroll in your app](imu-tilt.md) | intermediate | An app that scrolls when you tilt the badge |
| [Self-host OTA updates from your fork](ota-fork.md) | advanced | Your badge updating from your own GitHub releases |

Most hacks need [falera-cli](../CLI.md#install) and a USB-C cable. Wi-Fi on
the badge is only for the internet (GitHub, the App Store, updates); files
always go over USB.

## Write a hack

A hack is one Markdown file in this folder:

1. Open a [hack proposal](https://github.com/elixpo/falera/issues/new?template=hack_proposal.yml)
   so we can agree on the scope.
2. Write `docs/hacks/<slug>.md`: a `#` title, a sentence on what you end up
   with, a **Difficulty** / **You need** list, then numbered steps.
3. Name only commands, functions and files that exist, and say plainly
   what does not work yet (link the issue).
4. Add it to the table above. To show it on the website, add an entry to
   `falera.elixpo/src/data/hacks.ts`; the page at `/hacks/<slug>/` is built
   from your file.
5. Open a pull request, as described in
   [CONTRIBUTING.md](../../CONTRIBUTING.md).
