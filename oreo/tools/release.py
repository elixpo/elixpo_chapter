"""Cut a FaleraOS release from your laptop. No CI required.

Simplest path:
    python tools/release.py

That reads the version from oreoOS/config.py, picks today's date,
publishes to the stable channel. Done.

Overrides:
    python tools/release.py v1.3.0           # explicit version
    python tools/release.py --channel beta   # prerelease
    python tools/release.py --dry-run        # preview every command
    python tools/release.py --repo you/falera  # publish to another repository

The GitHub repository comes from OTA_REPO in oreoOS/ota.py, the one
badges built from this checkout update from, so a fork that points
OTA_REPO at itself publishes there with no other edit. --repo overrides
it. Every GitHub step uses it: the manifest's download URLs and the gh
release commands (`--repo`). `origin` must be that repository, since
the tag is pushed there.

The script auto-recovers from a half-failed previous run: if the tag
is already on the remote it skips git + jumps to build + publish.

If the working tree is dirty when you start, the script offers to
stage everything and commit it as "release: vX.Y.Z (auto)". Type N to
abort.

Channel convention:
  stable/vX.Y.Z   — what badges pick up by default
  beta/vX.Y.Z     — opt-in, marked as prerelease

Requirements:
  * `gh` CLI installed + authenticated (`gh auth status`)
  * `git` configured with push access to the repo
"""

import argparse
import ast
import re
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT  = Path(__file__).resolve().parent.parent
CONFIG     = REPO_ROOT / "oreoOS" / "config.py"
OTA        = REPO_ROOT / "oreoOS" / "ota.py"
VERSION_RE = re.compile(r'(VERSION\s*=\s*")v\d+\.\d+\.\d+(")')
# owner/name as GitHub allows them
REPO_RE    = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$")
ORIGIN_RE  = re.compile(r"github\.com[:/]+([^/\s]+/[^/\s]+?)(?:\.git)?/?$")


# ── the repository ──────────────────────────────────────────────────────────

def check_repo(repo, where):
    """`repo` if it looks like owner/name, else exit naming `where`."""
    repo = (repo or "").strip()
    if not REPO_RE.match(repo) or repo.endswith((".", ".git")):
        sys.exit("✗ %s: %r is not a GitHub repository (owner/name)" % (where, repo))
    return repo


def ota_repo(text):
    """OTA_REPO from the source of oreoOS/ota.py, or None. Parsed, not
    imported: ota.py needs the badge's modules."""
    for node in ast.parse(text).body:
        if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "OTA_REPO" for t in node.targets):
            try:
                value = ast.literal_eval(node.value)
            except ValueError:
                return None
            return value if isinstance(value, str) else None
    return None


def resolve_repo(override=None, ota_text=None):
    """(repo, source): --repo when given, else OTA_REPO in oreoOS/ota.py."""
    if override:
        return check_repo(override, "--repo"), "--repo"
    if ota_text is None:
        ota_text = OTA.read_text()
    found = ota_repo(ota_text)
    if found is None:
        sys.exit("✗ no OTA_REPO = \"owner/name\" in oreoOS/ota.py; pass --repo owner/name")
    return check_repo(found, "OTA_REPO in oreoOS/ota.py"), "OTA_REPO in oreoOS/ota.py"


def asset_base_url(repo, tag):
    """Where GitHub serves the release's files, as the manifest lists them."""
    return "https://github.com/%s/releases/download/%s/" % (repo, tag)


def repo_from_url(url):
    """owner/name from a GitHub remote URL (https, ssh or scp form), or None."""
    m = ORIGIN_RE.search((url or "").strip())
    return m.group(1) if m else None


def _origin_repo():
    """owner/name that `origin` points at, or None (no remote, not GitHub)."""
    try:
        r = subprocess.run(["git", "remote", "get-url", "origin"], cwd=REPO_ROOT,
                           capture_output=True, text=True)
    except OSError:
        return None
    return repo_from_url(r.stdout) if r.returncode == 0 else None


def _check_origin(repo, dry):
    """The tag is pushed to origin and the release made in `repo`: they
    must be the same repository, or the release points at a missing tag."""
    origin = _origin_repo()
    if origin is None:
        print("⚠ could not tell which GitHub repository `origin` is; the tag is "
              "pushed there and the release made in %s" % repo)
        return
    if origin.lower() != repo.lower():
        msg = ("`origin` is %s but the release goes to %s; the tag would be pushed "
               "to the wrong repository. Point origin at %s (git remote set-url) "
               "or pass --repo %s." % (origin, repo, repo, origin))
        if dry:
            print("⚠ " + msg)
        else:
            sys.exit("✗ " + msg)


def run(cmd, dry, capture=False, check=True):
    """Echo + execute (or echo only when dry-run)."""
    pretty = " ".join(str(c) for c in cmd)
    print("$", pretty)
    if dry:
        return ""
    if capture:
        r = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
        if check and r.returncode != 0:
            sys.exit("  ✗ exit %d\n%s" % (r.returncode, r.stderr.strip()))
        return r.stdout.strip()
    rc = subprocess.run(cmd, cwd=REPO_ROOT).returncode
    if check and rc != 0:
        sys.exit("  ✗ exit %d" % rc)
    return ""


# ── pre-flight ──────────────────────────────────────────────────────────────

def _read_current_version():
    """Default for the `version` arg — what's pinned in oreoOS/config.py."""
    m = VERSION_RE.search(CONFIG.read_text())
    if not m:
        return None
    return re.search(r'v\d+\.\d+\.\d+', m.group(0)).group(0)


def _handle_dirty_tree(version, dry, force, yes):
    """If the tree is dirty, interactively ask to auto-commit everything.

    - `force`: ignore dirty tree entirely (legacy escape hatch)
    - `yes`:   skip the prompt and auto-commit unconditionally
    Returns True iff we created an auto-commit.
    """
    if force:
        return False
    status = run(["git", "status", "--porcelain"], dry, capture=True, check=False)
    if not status:
        return False
    print("⚠ working tree is not clean:")
    for line in status.splitlines():
        print("    " + line)
    if yes:
        ans = "y"
    else:
        try:
            ans = input(
                "\nAuto-stage everything and commit as "
                "'release: %s (auto)'? [Y/n] " % version
            ).strip().lower() or "y"
        except EOFError:
            ans = "n"
    if ans not in ("y", "yes"):
        sys.exit("Aborted. Commit / stash manually and re-run.")
    run(["git", "add", "-A"], dry)
    run(["git", "commit", "-m", "release: %s (auto)" % version], dry)
    return True


def _check_tools(dry):
    for tool in ("git", "gh"):
        if shutil.which(tool) is None:
            sys.exit("✗ required tool not found on PATH: %s" % tool)
    auth = run(["gh", "auth", "status"], dry, capture=True, check=False)
    if not dry and "Logged in" not in auth and "Active account" not in auth:
        sys.exit("✗ `gh auth status` failed — run `gh auth login` first.")


def _tag_exists(tag, dry):
    if dry:
        return False
    out = run(["git", "ls-remote", "--tags", "origin", tag], dry, capture=True)
    return bool(out.strip())


def _release_exists(tag, repo, dry):
    """True iff a GitHub Release already exists for this tag."""
    if dry:
        return False
    out = run(["gh", "release", "view", tag, "--repo", repo], dry, capture=True,
              check=False)
    # gh prints "release not found" to stderr (we don't capture stderr here),
    # so the empty stdout case = no release. Defensive against gh format
    # changes: also accept a "release tag" line if it appears.
    return bool(out.strip())


# ── version bump ────────────────────────────────────────────────────────────

def _bump_version(target_version, dry):
    txt = CONFIG.read_text()
    m   = VERSION_RE.search(txt)
    if not m:
        sys.exit("✗ could not find VERSION literal in %s" % CONFIG)
    current = re.search(r'v\d+\.\d+\.\d+', m.group(0)).group(0)
    if current == target_version:
        print("  version already at %s — no bump needed" % target_version)
        return False
    new_line = '%s%s%s' % (m.group(1), target_version, m.group(2))
    new_txt  = txt[:m.start()] + new_line + txt[m.end():]
    print("  %s → %s in oreoOS/config.py" % (current, target_version))
    if not dry:
        CONFIG.write_text(new_txt)
    return True


# ── main flow ───────────────────────────────────────────────────────────────

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("version", nargs="?", default=None,
                    help="vX.Y.Z. Omit to use the version in oreoOS/config.py.")
    ap.add_argument("--channel", default="stable",
                    choices=("stable", "beta"),
                    help="release channel (default: stable)")
    ap.add_argument("--notes", default="",
                    help="release notes body. If omitted, a sensible default is used.")
    ap.add_argument("--force", action="store_true",
                    help="skip the clean-working-tree prompt entirely.")
    ap.add_argument("--yes", "-y", action="store_true",
                    help="answer 'yes' to every prompt (auto-stage, etc.).")
    ap.add_argument("--dry-run", action="store_true",
                    help="print every step without executing.")
    ap.add_argument("--repo", metavar="OWNER/NAME",
                    help="GitHub repository to publish to (default: OTA_REPO in "
                         "oreoOS/ota.py, where badges look for updates)")
    args = ap.parse_args(argv)

    # Default to whatever oreoOS/config.py:VERSION currently holds. This is
    # the zero-arg invocation: `python tools/release.py` ships exactly
    # whatever the repo is pointing at.
    if not args.version:
        current = _read_current_version()
        if not current:
            sys.exit("✗ could not read VERSION from oreoOS/config.py")
        args.version = current
        print("Using version from oreoOS/config.py: %s" % args.version)

    if not re.fullmatch(r"v\d+\.\d+\.\d+", args.version):
        sys.exit("✗ version must look like vX.Y.Z (got: %r)" % args.version)

    dry = args.dry_run
    tag = "%s/%s" % (args.channel, args.version)
    repo, repo_source = resolve_repo(args.repo)

    print("──────────────────────────────────────────────")
    print("Releasing FaleraOS %s on channel %s" % (args.version, args.channel))
    print("Repo: %s (%s)" % (repo, repo_source))
    print("Tag: %s" % tag)
    print("Dry-run: %s" % ("yes" if dry else "no"))
    print("──────────────────────────────────────────────\n")

    if args.repo:
        ota = ota_repo(OTA.read_text())
        if ota and ota.lower() != repo.lower():
            print("⚠ badges built from this checkout update from %s (OTA_REPO in "
                  "oreoOS/ota.py), not %s" % (ota, repo))

    # 1. Pre-flight.
    _check_tools(dry)
    _check_origin(repo, dry)

    # Resume detection: if the tag is already on origin AND there's no
    # GitHub Release for it (i.e. a previous attempt died after the tag
    # push), we skip the git steps and jump straight to build + publish.
    tag_on_remote = _tag_exists(tag, dry)
    release_live  = _release_exists(tag, repo, dry)
    # Three resume states the script knows how to handle:
    #   resume=False         clean run: full git → build → create
    #   resume="build"       tag pushed but no GitHub Release: git skipped,
    #                        build runs, gh release create runs
    #   resume="upload"      release exists with partial assets (previous
    #                        run died mid-upload): git skipped, build re-
    #                        runs, gh release upload --clobber backfills
    if release_live:
        resume = "upload"
        print("ℹ Release %s already exists — RESUMING from asset upload." % tag)
        print("  (previous run probably died mid-upload; we'll re-upload")
        print("   everything with --clobber so partial assets get replaced.)")
        print()
    elif tag_on_remote:
        resume = "build"
        print("ℹ tag %s already on origin — RESUMING from build step." % tag)
        print()
    else:
        resume = False

    # 2. Bump VERSION + commit + tag + push (skipped on resume).
    if not resume:
        _handle_dirty_tree(args.version, dry, args.force, args.yes)
        bumped = _bump_version(args.version, dry)
        if bumped:
            run(["git", "add", "oreoOS/config.py"], dry)
            run(["git", "commit", "-m", "release: %s" % args.version], dry)
        run(["git", "tag", tag], dry)
        run(["git", "push"], dry)
        run(["git", "push", "origin", tag], dry)

    # 3. Build the release artefacts. asset_base_url points at the URL
    # gh will use once the upload step has finished.
    asset_base = asset_base_url(repo, tag)
    run([
        sys.executable, "tools/build_release.py",
        "--version", args.version,
        "--channel", args.channel,
        "--asset-base-url", asset_base,
        "--notes", args.notes,
        "--out",   "dist",
    ], dry)

    # 4. Flatten the per-file assets into upload/ — the manifest's URLs
    # reference path-flattened names (slashes → underscores). build_release
    # already mirrored the tree; we just rename for upload.
    dist_files = REPO_ROOT / "dist" / args.version / "files"
    upload_dir = REPO_ROOT / "dist" / args.version / "_upload"
    if not dry:
        if upload_dir.exists():
            shutil.rmtree(upload_dir)
        upload_dir.mkdir(parents=True)
        for p in dist_files.rglob("*"):
            if p.is_file():
                rel = p.relative_to(dist_files)
                flat = str(rel).replace("/", "_")
                shutil.copyfile(p, upload_dir / flat)
        # Add manifest + bundle alongside.
        shutil.copyfile(REPO_ROOT / "dist" / args.version / "manifest.json",
                        upload_dir / "manifest.json")
        shutil.copyfile(REPO_ROOT / "dist" / args.version / "bundle.tar",
                        upload_dir / "bundle.tar")
        # The precompiled variant, when build_release.py found MicroPython
        # 1.28.0's mpy-cross (badges fall back to manifest.json without it).
        mpy_manifest = REPO_ROOT / "dist" / args.version / "manifest-mpy.json"
        if mpy_manifest.exists():
            shutil.copyfile(mpy_manifest, upload_dir / "manifest-mpy.json")

    # 5. Create the GitHub Release.
    prerelease_flag = ["--prerelease"] if args.channel != "stable" else []
    notes = args.notes or ("FaleraOS %s — %s channel." % (args.version, args.channel))

    # Title format: "FaleraOS v1.3.0 · 2026-05-15" for stable, plus a "(beta)"
    # suffix when off-channel. The date is ISO yyyy-mm-dd in UTC so it
    # matches what GitHub renders alongside the release.
    import datetime as _dt
    # tz-aware now() so we don't trip Python 3.12's utcnow() deprecation.
    today = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
    if args.channel == "stable":
        title = "FaleraOS %s · %s" % (args.version, today)
    else:
        title = "FaleraOS %s · %s · %s" % (args.version, today, args.channel)

    # Expand the upload-dir glob in Python — `gh release create` takes the
    # files as positional args, but subprocess.run passes them as literal
    # argv elements (no shell, so `*` doesn't expand). Without this `gh`
    # would try to stat a path literally named '*'.
    upload_files = []
    if not dry:
        upload_files = sorted(str(p) for p in upload_dir.iterdir() if p.is_file())
        if not upload_files:
            sys.exit("✗ %s is empty — build_release.py didn't produce any files" % upload_dir)
    else:
        # In dry-run we don't actually create _upload/, so just print a
        # placeholder; the real command on a wet run gets a real list.
        upload_files = ["<expanded at runtime>"]

    if resume == "upload":
        # Release row already exists from a half-failed previous run. We
        # only need to (re-)upload the asset files. --clobber replaces
        # any partial uploads from before.
        run([
            "gh", "release", "upload", tag,
            "--repo", repo,
            "--clobber",
            *upload_files,
        ], dry)
    else:
        run([
            "gh", "release", "create", tag,
            "--repo", repo,
            "--title", title,
            "--notes", notes,
            *prerelease_flag,
            "--target", "main",
            *upload_files,
        ], dry)

    print("\n✓ release %s pushed and published to %s." % (tag, repo))
    if not dry:
        print("  Badges on this channel will pick it up within 6 h of next")
        print("  background check (Settings → Check Update to force it now).")


if __name__ == "__main__":
    main()
