# LICENSES - directory layout

The code in this repository is licensed under the plain **MIT License**. The
top-level [`LICENSE`](../LICENSE) is the standard MIT text. Hardware design files are licensed under
**CERN-OHL-P-2.0**, and brand and visual assets under **CC-BY-4.0**. The structure of this directory mirrors the Linux kernel's
`LICENSES/` tree.

Rules for the Elixpo and Falera names, the Lumi mascot, the E-badge mark, and the
elixpo.com domains live in [`TRADEMARKS.md`](../TRADEMARKS.md). That is a
trademark policy, not a licence condition: it does not limit the MIT or
CC-BY-4.0 permissions.

## Subdirectories

```
preferred/    Licence texts used in this repository.
              Code is MIT; hardware is CERN-OHL-P-2.0; brand/visual
              assets are CC-BY-4.0.

exceptions/   `exceptions/Lumi-trademarks` is legacy, superseded by
              ../TRADEMARKS.md and no longer applied.

notices/      Third-party attributions (the upstream credit list).
```

## Index

| Path                          | SPDX ID     | Used for |
|-------------------------------|-------------|----------|
| `../LICENSE` / `preferred/MIT` | `MIT`       | All source code, scripts, configuration, and documentation. |
| `preferred/CERN-OHL-P-2.0`    | `CERN-OHL-P-2.0` | Hardware design files under `circuit/`: KiCad schematics, PCB layout, symbol library, BOMs, generator scripts' outputs and the generated PDFs. |
| `preferred/CC-BY-4.0`         | `CC-BY-4.0` | Brand and visual assets: the Lumi mascot art, badge sprites, app icons, banners, and splash art under `assets/` and the per-app `assets/` trees. |
| `preferred/Apache-2.0`        | `Apache-2.0` | Reference copy - covers upstream ESP-IDF components shipped in the firmware image. |

The Apache-2.0 file is included as a reference because firmware images
distributed from this repository contain ESP-IDF binary components, and
downstream distributors of compiled firmware must retain that license. See
[`notices/notice-board`](notices/notice-board) for the full upstream credit
list.

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
