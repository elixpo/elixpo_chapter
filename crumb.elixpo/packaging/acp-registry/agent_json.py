# Writes the ACP registry entry for crumb from a release tag's .sha256 files.
import json, subprocess, sys
tag = sys.argv[1]; version = tag.lstrip("v")
base = f"https://github.com/elixpo/crumb.elixpo/releases/download/{tag}"
assets = {"darwin-aarch64": "crumb-macos-aarch64.tar.gz", "darwin-x86_64": "crumb-macos-x86_64.tar.gz",
          "linux-aarch64": "crumb-linux-aarch64.tar.gz", "linux-x86_64": "crumb-linux-x86_64.tar.gz",
          "windows-x86_64": "crumb-windows-x86_64.zip"}
binary = {}
for platform, name in assets.items():
    sha = subprocess.run(["gh", "release", "download", tag, "-R", "elixpo/crumb.elixpo", "-p", name + ".sha256", "-O", "-"],
                         capture_output=True, text=True, check=True).stdout.split()[0]
    binary[platform] = {"archive": f"{base}/{name}", "sha256": sha,
                        "cmd": "crumb.exe" if platform.startswith("windows") else "./crumb", "args": ["acp"]}
entry = {"id": "crumb", "name": "Crumb", "version": version,
         "description": "Terminal coding agent with its own tools, sessions and approvals; Pollinations models by default",
         "repository": "https://github.com/elixpo/crumb.elixpo", "website": "https://crumb.elixpo.com",
         "authors": ["Ayushman Bhattacharya <ayushman.elixpo@gmail.com>"], "license": "MIT",
         "license_url": "https://github.com/elixpo/crumb.elixpo/blob/main/LICENSE",
         "distribution": {"binary": binary}}
print(json.dumps(entry, indent=2))
