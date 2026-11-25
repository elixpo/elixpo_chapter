## What changed

<!-- What and why, in a few sentences. Link the issue: "Closes #123". -->

## Tested on the host

<!-- The tests you ran or added. For hardware: ERC, DRC, the calculation behind a value. -->

## Still to check on a badge

<!-- What only a real badge (or an assembled board) can show, written as steps. "Nothing" is a fine answer. -->

## Checklist

- [ ] I read [CONTRIBUTING.md](https://github.com/elixpo/falera/blob/main/CONTRIBUTING.md) and the rules in [PREAMBLE.md](https://github.com/elixpo/falera/blob/main/PREAMBLE.md).
- [ ] `python3 -m unittest discover -s tests` and `python3 tools/validate_app.py` pass (and `cli/tests` for changes under `cli/`).
- [ ] A change to a contract between the OS and the CLI updates both sides, their tests and the docs.
- [ ] A schematic change was made in `generate_badge_schematic.py` and `circuit/elixpo/build.sh` was run; a pin change also updates `oreoWare/pins.py` and `docs/HARDWARE.md`.
- [ ] My commits are signed off (`git commit -s`).

---

<sub>By submitting this pull request I confirm my contribution is licensed under
the licence its path gives it, as [PREAMBLE.md](https://github.com/elixpo/falera/blob/main/PREAMBLE.md)
says: MIT for code and docs, CERN-OHL-P-2.0 for `circuit/`, CC-BY-4.0 for assets.</sub>
