"""Release packaging: install.sh, install.ps1, the release workflow and the
changelog agree with each other and with oreo_cli.__version__.

install.sh is run for real with `sh`, against a file:// download base and a
stub `pipx` on a PATH that holds nothing else, so nothing is downloaded or
installed. Skipped where `sh` or `curl` is missing (Windows).
"""

import hashlib
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import fake  # noqa: F401  (puts the package on sys.path)

from oreo_cli import __version__

CLI = Path(__file__).resolve().parents[1]
REPO = CLI.parent
INSTALL_SH = CLI / "install.sh"
INSTALL_PS1 = CLI / "install.ps1"
CHANGELOG = CLI / "CHANGELOG.md"
WORKFLOW = REPO / ".github" / "workflows" / "cli-release.yml"

WHEEL = "falera_cli-%s-py3-none-any.whl" % __version__
SDIST = "falera_cli-%s.tar.gz" % __version__

# What install.sh needs besides the installer itself.
TOOLS = ("sh", "curl", "mktemp", "rm", "awk", "grep", "sed", "tr", "sort",
         "uname", "cat", "printf", "sha256sum", "shasum")

STUB = """#!/bin/sh
printf '%s\\n' "$@" > "$STUB_LOG"
"""


def _have(*names):
    return all(shutil.which(n) for n in names)


class Versions(unittest.TestCase):
    def test_version_shape(self):
        # The workflow, install.sh and install.ps1 accept only this shape.
        self.assertRegex(__version__, r"^[0-9]+\.[0-9]+\.[0-9]+((a|b|rc)[0-9]+)?$")

    def test_changelog_has_a_section_for_this_version(self):
        text = CHANGELOG.read_text(encoding="utf-8")
        self.assertRegex(text, r"(?m)^## \[%s\] - \d{4}-\d{2}-\d{2}$" % re.escape(__version__))

    @unittest.skipUnless(WORKFLOW.exists(), "not inside the FaleraOS repository")
    def test_workflow_asset_names_match_the_installers(self):
        wf = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("tags: ['cli-v*']", wf)
        self.assertIn('WHEEL="falera_cli-$VERSION-py3-none-any.whl"', wf)
        self.assertIn('SDIST="falera_cli-$VERSION.tar.gz"', wf)
        self.assertIn("--latest=false", wf)
        self.assertIn("actions/attest-build-provenance@", wf)
        sh = INSTALL_SH.read_text(encoding="utf-8")
        ps1 = INSTALL_PS1.read_text(encoding="utf-8")
        self.assertIn('asset="falera_cli-${candidate}-py3-none-any.whl"', sh)
        self.assertIn('asset="oreo_cli-${candidate}-py3-none-any.whl"', sh)   # releases before the rename
        self.assertIn('releases/download/cli-v${candidate}', sh)
        self.assertIn('$Asset = "falera_cli-$Candidate-py3-none-any.whl"', ps1)
        self.assertIn('$Asset = "oreo_cli-$Candidate-py3-none-any.whl"', ps1)   # releases before the rename
        self.assertIn("releases/download/cli-v$Candidate", ps1)

    @unittest.skipUnless(WORKFLOW.exists(), "not inside the FaleraOS repository")
    def test_workflow_never_runs_on_oreoos_pushes(self):
        wf = WORKFLOW.read_text(encoding="utf-8")
        on = wf.split("\non:\n", 1)[1].split("\npermissions:", 1)[0]
        self.assertNotIn("branches: [main]\n    paths:\n      - 'oreoOS", on)
        self.assertNotIn("workflow_run", on)
        self.assertRegex(on, r"push:\n    tags: \['cli-v\*'\]\n")
        self.assertNotRegex(on, r"push:\n    branches")


@unittest.skipUnless(INSTALL_SH.exists() and _have("sh", "curl", "mktemp", "awk"),
                     "needs install.sh, sh and curl")
class InstallScript(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="oreo-install-test-"))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.release = self.tmp / "release"
        self.release.mkdir()
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        for tool in TOOLS:
            path = shutil.which(tool)
            if path:
                os.symlink(path, self.bin / tool)
        self.log = self.tmp / "installer.log"
        self.payload = b"not really a wheel, but install.sh only hashes it\n"
        (self.release / WHEEL).write_bytes(self.payload)

    def write_checksum(self, digest=None):
        digest = digest or hashlib.sha256(self.payload).hexdigest()
        (self.release / (WHEEL + ".sha256")).write_text("%s  %s\n" % (digest, WHEEL))

    def add_stub(self, name):
        stub = self.bin / name
        stub.write_text(STUB)
        stub.chmod(0o755)

    def run_install(self, **env):
        full = {
            "PATH": str(self.bin),
            "HOME": str(self.tmp),
            "TMPDIR": str(self.tmp),
            "STUB_LOG": str(self.log),
            "OREO_CLI_VERSION": "cli-v" + __version__,
            "OREO_CLI_DOWNLOAD_BASE": self.release.as_uri(),
        }
        full.update(env)
        return subprocess.run([shutil.which("sh"), str(INSTALL_SH)], env=full,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              universal_newlines=True, timeout=60)

    def installer_args(self):
        return self.log.read_text().split("\n")[:-1] if self.log.exists() else None

    def test_verified_wheel_is_installed_with_pipx(self):
        self.write_checksum()
        self.add_stub("pipx")
        self.add_stub("uv")
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("Checksum OK", r.stdout)
        args = self.installer_args()
        self.assertEqual(args[:2], ["install", "--force"])
        self.assertTrue(args[2].endswith("/" + WHEEL))

    def test_uv_is_used_when_pipx_is_missing(self):
        self.write_checksum()
        self.add_stub("uv")
        r = self.run_install(OREO_CLI_VERSION=__version__)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.installer_args()[:3], ["tool", "install", "--force"])

    def test_installer_can_be_chosen(self):
        self.write_checksum()
        self.add_stub("pipx")
        self.add_stub("uv")
        r = self.run_install(OREO_CLI_INSTALLER="uv")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.installer_args()[0], "tool")

    def test_checksum_mismatch_installs_nothing(self):
        self.write_checksum("0" * 64)
        self.add_stub("pipx")
        r = self.run_install()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("checksum mismatch", r.stderr)
        self.assertIsNone(self.installer_args())

    def test_malformed_checksum_installs_nothing(self):
        self.write_checksum("not-a-digest")
        self.add_stub("pipx")
        r = self.run_install()
        self.assertNotEqual(r.returncode, 0)
        self.assertIsNone(self.installer_args())

    def test_missing_release_is_reported(self):
        self.add_stub("pipx")
        r = self.run_install(OREO_CLI_VERSION="9.9.9")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("9.9.9 has no release", r.stderr)
        self.assertIsNone(self.installer_args())

    def test_bad_version_is_rejected_before_any_download(self):
        self.add_stub("pipx")
        for bad in ("latest/../../x", "1.2", "v1.2.3;rm -rf /", "1.2.3-dev"):
            r = self.run_install(OREO_CLI_VERSION=bad)
            self.assertNotEqual(r.returncode, 0, bad)
            self.assertIn("OREO_CLI_VERSION must look like", r.stderr)
        self.assertIsNone(self.installer_args())

    def test_no_installer_gives_instructions(self):
        self.write_checksum()
        r = self.run_install()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("pipx or uv", r.stderr)
        self.assertIn("astral.sh/uv", r.stderr)

    def test_unknown_installer_is_rejected(self):
        self.add_stub("pipx")
        r = self.run_install(OREO_CLI_INSTALLER="pip")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("must be pipx or uv", r.stderr)

    def test_latest_with_a_download_base_needs_a_version(self):
        self.add_stub("pipx")
        r = self.run_install(OREO_CLI_VERSION="latest")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("needs OREO_CLI_VERSION", r.stderr)


if __name__ == "__main__":
    unittest.main()
