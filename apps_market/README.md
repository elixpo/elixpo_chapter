# App Store catalogue

Every folder here is an app the badge's **App Store** can install. The
Store does not walk this tree on the badge; it downloads one file,
[`index.json`](index.json), from
`raw.githubusercontent.com/elixpo/falera/main/apps_market/index.json`, caches
it on flash and installs each app's files from the paths listed there.

## Adding or changing an app

1. Create or edit `apps_market/<folder>/` (`main.py`, `manifest.json`,
   `__init__.py`, `src/`, `assets/optimized/`). Raw and transparent PNGs
   stay in the repo; only `assets/optimized/*.py` goes to the badge.
2. Run `python3 tools/build_store_index.py`. It refreshes each entry's
   id (manifest `slug` or the folder name), version, icon, file list and
   size, and adds an entry for any new folder.
3. In `index.json`, give a new entry its `name`, `tagline` (24 characters
   at most: it is the one-line text in the Store list), `description`,
   `category` (Games, Tools, Utilities, Social or System) and `author`.
   These hand-written fields are kept when the tool runs again.
4. Commit the folder and `index.json` together. `tests/test_store.py`
   fails if the index is out of date.

The icon is looked up in the OS image first (`assets/icons/optimized/`),
then downloaded from `apps_market/<folder>/assets/optimized/<icon>.py`,
so an app with a new icon must ship its optimized icon module there:
`python3 tools/app_icon.py apps_market/<folder>` makes it from an
`icon.png` in the folder.

Check the app with `python3 tools/validate_app.py apps_market/<folder>`
(CI runs it on every app). Saves belong in `/state` through
`oreoOS.state`, which the Store leaves alone on uninstall, so a
reinstalled game keeps its high score. See [`docs/APPS.md`](../docs/APPS.md).

An entry may be listed before its folder exists (Patakha while it is
being built); the badge then finds its files through the GitHub API at
install time. Run the tool once the folder lands.

Apps install into the badge's filesystem (the `vfs` partition), which
takes all of the 16 MB flash after the firmware: about 13.7 MB.
