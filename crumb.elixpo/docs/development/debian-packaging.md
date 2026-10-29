# Debian packaging

Crumb has two Debian distribution tracks. They are deliberately separate.

## Elixpo APT repository

Protected Crumb releases build `amd64` and `arm64` `.deb` files for Elixpo's
signed repository at `https://packages.elixpo.com/apt/`. Those packages make
Crumb convenient to install, but they are not packages from Debian's archive.
They are built by `packaging/debian/build-deb.sh` in the release workflow.

## Official Debian archive

The Debian source package is maintained on Salsa, not in this repository:

```text
https://salsa.debian.org/elixpo/crumb
```

That repository follows the DEP-14 layout used by `git-buildpackage`:
`debian/latest` holds the packaging, while `upstream/latest` and
`pristine-tar` hold imported release tarballs. Each Debian upload is based on
a tagged GitHub release, which `debian/watch` finds through `uscan`. Upstream
does not ship a `debian/` directory, so the two cannot drift apart.

The Debian build uses this explicit Cargo profile:

```bash
cargo build -p crumb-cli --no-default-features --features debian
```

The `debian` feature first appears in Crumb 1.0.4; earlier release tarballs
cannot be built by the Debian package. The normal upstream release still
enables bundled SQLite, native keyring storage, and Sigstore verification by
default. The Debian profile instead:

- links to Debian's system SQLite;
- reads provider credentials from environment variables;
- retains the bundled, audited skill catalogue; and
- refuses remote Sigstore verification because that verifier is not compiled
  into the Debian build.

Requests for unavailable integrations fail explicitly. They do not downgrade
to unverified remote installation or silently store credentials elsewhere.

## Dependency boundary

Every external crate in the Debian profile is packaged in unstable at a
compatible version; the last missing one, `reedline`, entered unstable on
24 October 2026. Run the boundary check with:

```bash
python3 scripts/check-debian-dependencies.py
```

It fails if any dependency goes missing from Debian or becomes incompatible.
Do not vendor a crate in the Crumb source package to bypass Debian review;
package it through the Debian Rust Team instead.

## reedline

`reedline` is packaged by the Debian Rust Team in `debcargo-conf`. The
existing unreleased 0.48.0 overlay was updated to 0.52.1 in
[merge request !1493](https://salsa.debian.org/rust-team/debcargo-conf/-/merge_requests/1493),
with Ayushman Bhattacharya added to its uploaders. It was merged on 24 October
2026 and `rust-reedline 0.52.1-1` was accepted into unstable.

## ITP status

The ITP was accepted by the Debian BTS on 19 October 2026 as
[#1151280](https://bugs.debian.org/1151280). The submitted message is retained
in `docs/development/debian-itp.txt` for packaging history. Further ITP
correspondence belongs at `1151280@bugs.debian.org`. The sponsorship request
in `docs/development/debian-rfs.txt` was filed as
[#1152019](https://bugs.debian.org/1152019). Simon Quigley sponsored 1.1.0-1,
which ftpmaster accepted from NEW into unstable on 28 October 2026, closing
the ITP. Simon also sponsored 1.1.0-3, accepted the same day.

1.1.0-3 answers the review of 1.1.0-1: `debian/copyright` lists the Sigstore
test fixtures (Apache-2.0), limits CC-BY-4.0 to the website images, and
credits the Pollinations logo; the package moves to debhelper compat 14 and a
version 5 watch file; and the autopkgtests now run the upstream test suite
against Debian's crates and exercise the installed binary offline. It also
build-depends on `ca-certificates` for minimal build environments and adds
Salsa CI.

## Archive submission sequence

1. Land `rust-reedline` through the Debian Rust Team (done: 0.52.1-1 is in
   unstable).
2. Import the release into the Salsa repository (1.1.0 is imported as
   `upstream/1.1.0`; 1.1.0 adds the `regex` and `walkdir` build dependencies).
3. Build the signed source package in a clean, network-isolated unstable
   environment.
4. Run `lintian`, `autopkgtest`, `piuparts`, and `sbuild`.
5. Upload the signed source package to `mentors.debian.net` and file an RFS
   against `sponsorship-requests` (done: #1152019, sponsored).
6. Respond to sponsor and FTP NEW review (done: 1.1.0-1 accepted 28 October
   2026).

Crumb is in Debian unstable (https://tracker.debian.org/pkg/crumb). Later
releases follow the same route: import the release, build and test, upload to
mentors, and ask the sponsor to upload.
