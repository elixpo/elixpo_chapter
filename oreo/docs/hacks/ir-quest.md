# Beam a booth code between badges with IR Quest

Every badge has an infrared transmitter and receiver. **IR Quest**, an App
Store app, sends 32-bit NEC codes, shows what it receives, and can replay a
remote control it has recorded. This hack turns one badge into a "booth
beacon" that sends a code over and over, and has a second badge pick it up.

- **Difficulty:** intermediate, about 30 minutes
- **You need:** two badges with the IR parts fitted (TSOP38238 receiver on
  GPIO 18, IR LED driven by a 2N2222 from GPIO 2; see
  [HARDWARE.md](../HARDWARE.md#pinout)), Wi-Fi on the badges for the App
  Store, and [falera-cli](../CLI.md#install). A TV remote is handy for testing.

## Be aware: receiving is not reliable yet

Sending works. Receiving has an open bug,
[#48](https://github.com/elixpo/falera/issues/48): on the ESP32-S3 the native
RMT receiver could fail to start (`RMT RX ... failed: ESP_ERR_IN...`). The
cause found in the code is the receiver's glitch filter, which asked for
more than the ESP32-S3 allows (`ESP_ERR_INVALID_ARG`); firmware with the fix
still has to be confirmed on a badge. When the native receiver fails, the
driver (`oreoWare/ir.py`) falls back to timing edges with a pin interrupt,
which works but is less exact. IR Quest shows which receiver is running on
its **DIAG** tab, with the complete error. If yours shows one, run the
self-test below and add its output to #48; that is a useful contribution in
itself.

```bash
falera run tools/ir_selftest.py      # from a FaleraOS checkout; ends in "IR48 RESULT"
```

Despite its store description, IR Quest does not keep or trade tokens
yet: it sends, receives and shows codes. Token trading is an app still to
be written.

## 1. Install IR Quest on both badges

```bash
falera apps install quest
```

or open **App Store** on the badge.

## 2. Check the receiver

Open **IR Quest**. It starts on the **FOCUS** tab, which shows the latest
code it decoded in large hex, the protocol and the pulse count. Point a TV
remote at the badge and press a button: an NEC remote shows its code, other
remotes show as a raw recording.

Press **B** to cycle the tabs: FOCUS, BEACON, SEND, DIAG. On **DIAG**, the
backend reads `native RMT` or `pin IRQ (fallback)`, with the RMT channel,
DMA, glitch filter, driver state and the full error text if the native
receiver failed (**UP**/**DOWN** scroll it). **A** restarts the receiver
there, and **RIGHT** turns on a serial log of every receiver step, which
`falera logs` shows as `[ir]` lines.

## 3. Send a code from the other badge

On the second badge, open IR Quest and go to **SEND**:

- **UP / DOWN** pick what to send: the last recording, or one of the
  built-in codes (`Booth A` = `0xCAFEBABE`, `Booth B` = `0xDEADBEEF`,
  `Booth C`, `Booth D`, `Ping`, `Pong`);
- **LEFT / RIGHT** pick the carrier: 38, 40 or 56 kHz (the receiver is a
  38 kHz part, so keep 38 kHz);
- **A** fires.

Hold the badges a short distance apart with the IR parts facing each
other. The first badge's **BEACON** tab counts every frame since the app
opened and lists the last six.

## 4. Make a beacon that keeps sending

For a booth, a badge can send a code every second without anyone pressing
**A**. Save this as `beacon.py` on your computer:

```python
import time
from oreoWare import ir

CODE = 0xCAFEBABE      # Booth A; any 32-bit value

while True:
    ir.transmit_nec(CODE, carrier_hz=38000)
    time.sleep(1)
```

and run it on the beacon badge:

```bash
falera run beacon.py
```

`falera run` pauses FaleraOS while the script runs and streams its output, so
the beacon badge stays plugged into the computer running `falera`.
**Ctrl-C** stops it and FaleraOS starts again. Visitors with IR Quest open on
BEACON see `CAFEBABE` arrive once a second.

To add your own named codes to the SEND list, edit `CODES` at the top of
`apps_market/quest/src/app.py`.

## Ideas from here

- A real token game: give each booth a code, and have an app remember
  which codes it has seen with `oreoOS.state`. Propose it with the
  [app form](https://github.com/elixpo/falera/issues/new?template=app_proposal.yml).
- Help close [#48](https://github.com/elixpo/falera/issues/48): its
  acceptance criteria list what has to be tested.
