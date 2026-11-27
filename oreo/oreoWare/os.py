"""OS implementation for the hardware backend.

Holds singletons for every peripheral, mediates app-↔-launcher communication
(quit / launch requests), and stores OS-wide settings. settings_get/set
persist to /state/os.json through oreoOS.state, so they survive a reboot.
"""

from oreoOS import api, state
from oreoWare.display import Display
from oreoWare.buttons import Buttons


# /state/os.json; apps' own state files use their app id, which is never "os".
SETTINGS_STATE = "os"
# Keys that describe this boot only and must not outlive it. The OTA flow
# (oreoOS/ota.py, apps/updates, the launcher's post-update check) treats
# its ota_* flags as per-boot status; persisting "ready" or "needs-confirm"
# would show a stale update prompt after the update was applied.
VOLATILE_PREFIXES = ("ota_",)


def _volatile(key):
    for p in VOLATILE_PREFIXES:
        if isinstance(key, str) and key.startswith(p):
            return True
    return False


class OS(api.OS):
    def __init__(self):
        self.display = Display()
        self.buttons = Buttons()
        # backends added incrementally — wired up as each peripheral comes online
        self.leds = None
        self.ir   = None
        self.adc  = None

        self._quit_requested = False
        self._launch_request = None
        self._settings = None   # loaded from /state/os.json on first use
        self._volatile = {}     # ota_* and other per-boot keys

    def quit(self):
        self._quit_requested = True

    def launch(self, name):
        self._launch_request = name
        self._quit_requested = True

    def _settings_dict(self):
        if self._settings is None:
            self._settings = state.load(SETTINGS_STATE)
        return self._settings

    def settings_get(self, key, default=None):
        if _volatile(key):
            return self._volatile.get(key, default)
        return self._settings_dict().get(key, default)

    def settings_set(self, key, value):
        """Store a JSON-serialisable value. Writes flash only when the value
        actually changes, so calling it every frame is cheap but pointless."""
        if _volatile(key):
            self._volatile[key] = value
            return
        s = self._settings_dict()
        if key in s and s[key] == value:
            return
        s[key] = value
        state.save(SETTINGS_STATE, s)
