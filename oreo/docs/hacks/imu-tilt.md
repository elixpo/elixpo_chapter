# Tilt to scroll in your app

The badge has an MPU-6050 accelerometer and gyroscope. The Racer game
already steers with it. This hack reads the same sensor in your own app and
turns a forward or backward tilt into scrolling, alongside **UP / DOWN**.

- **Difficulty:** intermediate, about 25 minutes
- **You need:** a badge with the MPU-6050 fitted (I2C on GPIO 42/47, see
  [HARDWARE.md](../HARDWARE.md#pinout)), a USB-C cable,
  [falera-cli](../CLI.md#install), and the basics from [APPS.md](../APPS.md)

There is no OS-wide "tilt scrolls every app" switch: each app decides what
tilt means. This page adds it to one app you write.

## The sensor API

`oreoWare/imu.py` is the driver:

| Call | Returns |
|---|---|
| `imu.detect()` | an `MPU6050` (asleep), or `None` if no chip answers at 0x68 or 0x69 |
| `sensor.wake()` / `sensor.sleep()` | power on / about 5 µA sleep |
| `sensor.read_accel_g()` | `(ax, ay, az)` in g; about `(0, 0, 1)` lying flat, screen up |
| `sensor.read_gyro_dps()` | `(gx, gy, gz)` in degrees per second |
| `sensor.tilt_deg()` | `(pitch, roll)` in degrees, from the accelerometer |
| `sensor.calibrate(samples=200)` | learns the resting offsets; blocks for a while (Racer uses 80 samples) |

One read is a 14-byte I2C burst of about 3 ms, cheap enough for every
frame.

## 1. Start an app

```bash
falera new tilt_scroll
```

## 2. Write `tilt_scroll/src/app.py`

```python
import oreoOS
from oreoOS import api, theme, widgets

DEADZONE = 8.0      # degrees of tilt that do nothing
FULL = 30.0         # degrees for full speed
MAX_SPEED = 160.0   # pixels per second at FULL
SIGN = 1            # set to -1 if tilting scrolls the wrong way
LINE_H = 12
N_LINES = 60


def tilt_speed(deg):
    """Map a tilt angle to a scroll speed, with a dead zone."""
    if -DEADZONE < deg < DEADZONE:
        return 0.0
    mag = min(1.0, (abs(deg) - DEADZONE) / (FULL - DEADZONE))
    return SIGN * MAX_SPEED * mag * (1 if deg > 0 else -1)


class App(oreoOS.App):
    name = "Tilt Scroll"

    def on_enter(self, os):
        super().on_enter(os)
        self._y = 0.0
        self._zero = 0.0
        self._dirty = True
        # Share one driver with Racer and the gesture engine (os._imu).
        self._imu = getattr(os, "_imu", None)
        if self._imu is None:
            try:
                from oreoWare import imu
                self._imu = imu.detect()
            except Exception:
                self._imu = None
            if self._imu is not None:
                os._imu = self._imu
        if self._imu is not None:
            try:
                self._imu.wake()
                self._zero = self._imu.tilt_deg()[0]  # how you hold it now
            except Exception:
                self._imu = None

    def on_exit(self):
        if self._imu is not None:
            try:
                self._imu.sleep()
            except Exception:
                pass

    def on_button_press(self, btn):
        if btn == api.BTN_UP:
            self._scroll(-LINE_H)
        elif btn == api.BTN_DOWN:
            self._scroll(LINE_H)
        elif btn == api.BTN_SELECT and self._imu is not None:
            self._zero = self._imu.tilt_deg()[0]   # A: re-centre

    def _scroll(self, dy):
        _, top, _, h = widgets.play_area()
        limit = max(0, N_LINES * LINE_H - h)
        y = min(limit, max(0, self._y + dy))
        if int(y) != int(self._y):
            self._dirty = True
        self._y = y

    def update(self, dt):
        if self._imu is None:
            return
        try:
            pitch, _roll = self._imu.tilt_deg()
        except Exception:
            return
        speed = tilt_speed(pitch - self._zero)
        if speed:
            self._scroll(speed * dt)

    def draw(self, d):
        if not self._dirty:
            return
        d.clear(theme.BG)
        widgets.draw_header(d, "TILT SCROLL")
        _, top, _, h = widgets.play_area()
        first = int(self._y) // LINE_H
        off = int(self._y) % LINE_H
        for i in range(h // LINE_H + 2):
            n = first + i
            y = top + i * LINE_H - off
            if n >= N_LINES or y > top + h - 8:
                break
            if y >= top:
                d.text("line %d" % n, 12, y, theme.TEXT_BRIGHT)
        widgets.draw_hint(d, "tilt or UP/DN  A=centre" if self._imu
                          else "no IMU: UP/DN  HOME=back")
        self._dirty = False
```

What it does:

- **`on_enter`** finds the sensor once, wakes it and remembers the pitch
  you are holding the badge at, so "level" is however you hold it.
- **`update(dt)`** reads the tilt every frame and scrolls by speed times
  `dt`, so the speed is the same at any frame rate. It never blocks.
- **`on_exit`** puts the chip back to sleep, as Racer does.
- Without an IMU the app still works with **UP / DOWN**.

## 3. Check it and install it

```bash
python3 tools/validate_app.py ./tilt_scroll   # from a FaleraOS checkout
falera app install ./tilt_scroll
```

`validate_app.py` warns that the app imports `oreoWare` directly: apps
should use the `os` object, but it has no IMU accessor yet
([#67](https://github.com/elixpo/falera/issues/67)). Racer has the same
warning. For quicker edits, `falera dev` loads the app from your computer
([APPS.md](../APPS.md#live-editing-with-oreo-dev)).

## Things to know

- **Axes depend on the board.** `tilt_deg()` assumes the screen faces up.
  If forward tilt scrolls up, set `SIGN = -1`; if pitch does nothing, try
  `_roll` instead.
- **Gestures share the chip.** With gestures switched on in Settings, the
  OS keeps the IMU in a low-rate mode (about 5 readings a second) and
  re-applies it every couple of seconds, so tilt feels steppy. Turn
  gestures off for smooth scrolling.
- **No IMU found:** `imu.i2c_scan()` in `falera shell` lists the addresses on
  the bus; an empty list means wiring or power.
- `tilt_speed` is pure Python: test it on your computer like the tests in
  `tests/`.
