"""`falera update` / `falera flash`: wrappers around a FaleraOS checkout.

Today these call the repository's own scripts (./deploy, ./build-firmware),
so they need `--repo <path to an falera checkout>`. Release-based updates
(download a signed FaleraOS bundle from GitHub and install it over USB) are
future work, tracked in issue #117.
"""

import os
import shutil
import subprocess
from pathlib import Path

from .errors import OreoError


def check_repo(path):
    if not path:
        raise OreoError("this command needs a FaleraOS checkout",
                        hint="pass --repo <path to a clone of github.com/elixpo/falera>; "
                             "updating from GitHub releases is not available yet")
    root = Path(path).expanduser().resolve()
    for need in ("deploy", "deploy.sh", "build-firmware", "oreoOS/config.py"):
        if not (root / need).exists():
            raise OreoError("%s does not look like a FaleraOS checkout (missing %s)" % (root, need),
                            hint="clone it: git clone https://github.com/elixpo/falera")
    return root


def _bash():
    if os.name != "nt":
        return None
    found = shutil.which("bash")
    if not found:
        raise OreoError("these scripts need bash", hint="on Windows, run falera from Git Bash or WSL")
    return found


def deploy_cmd(root, port, clean=False, force=False, no_bump=False, override=None):
    cmd = [str(root / "deploy"), "--board", "--port", port]
    if clean:
        cmd.append("--clean")
    if force:
        cmd.append("--force")
    if no_bump:
        cmd.append("--no-bump")
    if override:
        cmd += ["--override", override]
    bash = _bash()
    return ([bash] + cmd) if bash else cmd


def flash_cmd(root, port):
    cmd = [str(root / "deploy"), "--full", "--port", port]
    bash = _bash()
    return ([bash] + cmd) if bash else cmd


def build_cmd(root):
    cmd = [str(root / "build-firmware")]
    bash = _bash()
    return ([bash] + cmd) if bash else cmd


def run(cmd, cwd, runner=None):
    runner = runner or subprocess.call
    rc = runner(cmd, cwd=str(cwd))
    if rc:
        script = next((c for c in cmd if not c.endswith(("bash", "bash.exe"))), cmd[0])
        raise OreoError("%s exited with status %d" % (Path(script).name, rc))
    return rc
