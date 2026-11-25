class App:
    """Base class for Lix OS apps.

    Lifecycle: on_enter -> (update + draw)* -> on_exit
    Subclass and override any of: on_enter, update, draw, on_exit,
    on_button_press, on_button_release.
    """

    name = "unnamed"

    # Set True when C is one of the app's own controls (a game's strafe, a
    # button tester): the OS then delivers C to on_button_press instead of
    # opening the notification panel. It is read on every press, so an app
    # may also flip it on the instance at runtime (e.g. only during play).
    CAPTURES_C = False

    def on_enter(self, os):
        self.os = os

    def on_exit(self):
        pass

    def update(self, dt):
        """Per-frame state update. dt = seconds since last frame."""

    def realtime_mode(self):
        """True while an app needs the low-latency scheduler.

        Realtime mode preserves input polling but defers OS network/storage
        housekeeping. Apps should enable it only for the active playback or
        capture interval, never for their whole lifetime.
        """
        return False

    def draw(self, display):
        """Per-frame rendering. Don't call display.present() — the OS does that."""

    def after_present(self, elapsed_us):
        """Optional notification after the OS completes an LCD presentation."""

    def invalidate(self):
        """Called by the OS after an overlay (notification panel, pair
        prompt) covered the app. Apps that redraw only what changed should
        override this to schedule a full repaint."""
        self._dirty = True

    def on_button_press(self, btn):
        pass

    def on_button_release(self, btn):
        pass
