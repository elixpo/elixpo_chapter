"""Persistent hi-score storage for Snake.

Lives in its own module so the app code never deals with file paths
directly: a teaching example of keeping I/O out of game logic. The
score is kept by oreoOS.state in /state/snake.json, outside the app
folder, so it survives an uninstall and reinstall.
"""

try:
    from oreoOS import state
except ImportError:   # OS before the /state helper: keep the old file save
    state = None

LEGACY_PATH = "apps/snake/hiscore.txt"   # pre-/state save, migrated once


def load():
    """The current hi-score. 0 on first run; never raises."""
    if state is None:
        try:
            with open(LEGACY_PATH) as f:
                return int(f.read().strip() or "0")
        except Exception:
            return 0
    return int(state.load_migrating("snake", {"hi": 0},
                                    LEGACY_PATH, ("hi",))["hi"])


def save(value):
    """Persist a new hi-score. A failed write (full flash) is ignored so
    the game keeps running."""
    if state is None:
        try:
            with open(LEGACY_PATH, "w") as f:
                f.write(str(int(value)))
        except Exception:
            pass
        return
    state.save("snake", {"hi": int(value)})
