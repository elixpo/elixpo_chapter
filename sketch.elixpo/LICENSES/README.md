# LICENSES - directory layout

The code in this repository is licensed under the plain **MIT License**. The
top-level [`LICENSE`](../LICENSE) is the standard MIT text; there is no custom
exception attached to it. Brand and visual assets are licensed under
**CC-BY-4.0**. The structure of this directory mirrors the Linux kernel's
`LICENSES/` tree.

Rules for the Elixpo and Oreo names, the Oreo mascot, the E-badge mark, and the
elixpo.com domains live in [`TRADEMARKS.md`](../TRADEMARKS.md). That is a
trademark policy, not a licence condition: it does not limit the MIT or
CC-BY-4.0 permissions.

## Subdirectories

```
preferred/    Licence texts used in this repository.
              Code is MIT; brand/visual assets are CC-BY-4.0.

exceptions/   Legacy. `exceptions/Oreo-trademarks` is superseded by
              ../TRADEMARKS.md and is no longer applied to any file.

notices/      Third-party attributions (the upstream credit list).
```

## Index

| Path                          | SPDX ID     | Used for |
|-------------------------------|-------------|----------|
| `../LICENSE` / `preferred/MIT` | `MIT`       | All source code, scripts, configuration, and documentation. |
| `preferred/CC-BY-4.0`         | `CC-BY-4.0` | Brand and visual assets: everything under `brand/` and `public/brand/` (where present), plus the Lix\* brand fonts and any banner, splash, sticker, icon, or mascot art. |

## The notice board

Per-product notes (published package names, marketplace listings, hosted
services, release channels, etc.) are recorded in the
[`NOTICE`](NOTICE) file - the "notice board".

## Contributions

By submitting a pull request you agree your contribution is licensed inbound
under MIT (code) or CC-BY-4.0 (brand/visual assets), and that you have the
right to submit it. The
[Developer Certificate of Origin](https://developercertificate.org) applies to
every commit. We do not require a CLA.
