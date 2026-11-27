# Bluetooth on the Falera Badge

This page describes what Bluetooth does on the badge as of FaleraOS 2.0 (code in
`oreoWare/bt.py`, `apps/bt/`, `oreoOS/pair_prompt.py`, `oreoOS/bonds.py` and
`tools/bt_send.py`), what it does not do, and what to build next.

**Short version:** a phone sends files to the badge over **WiFi**, not
Bluetooth (Settings > WiFi > Send files; see `oreoOS/http_server.py`). Bluetooth
Low Energy (BLE) works as a pairing radio and as a slow receive link for
`.txt` / `.md` files sent from a laptop with `tools/bt_send.py`. There is no
phone app for BLE transfer.

## What works today

### Turning it on

- Bluetooth is **off at boot**. `bt.init_from_config()` does nothing on
  purpose, and the `BT_AUTO_ENABLE` setting in `oreoOS/config.py` is not read.
- Turn it on from the notification panel's BT chip (press **C**), or from
  **Settings > Bluetooth** (press **A**). The on/off state is not saved and goes
  back to off after a reboot.
- The Bluetooth page shows the radio state, whether the badge is visible or
  connected (with the peer's MAC address), how many devices are paired, and a
  progress bar while a BLE transfer is arriving. **C** disconnects the peer.

### Advertising and connections

- While on, the badge advertises as a connectable BLE peripheral named
  **"Falera"**. The scan response carries the service UUID below. The interval
  comes from `BT_ADV_INTERVAL_MS` (500 ms in `config.py`; 200 ms if the setting
  is missing).
- One peer at a time. A second central is disconnected straight away, and
  advertising stops while a peer is connected. When the peer leaves,
  advertising restarts, and a watchdog in the run loop re-issues it every 30 s
  in case it stopped silently.
- Phones see "Falera" in generic BLE apps (nRF Connect, LightBlue) and can
  connect to it there. Whether it also appears in the phone's system Bluetooth
  settings depends on the phone.

### Pairing

- Security config: bonding, MITM protection, LE Secure Connections, and the
  `DISPLAY_YESNO` IO capability. With a modern phone this runs **Numeric
  Comparison**: the same 6-digit number shows on both screens, and the badge
  shows a full-screen prompt (`oreoOS/pair_prompt.py`) where **A** accepts
  and **B** rejects.
- Bonds and their keys are stored in `/bonds.json`, which holds at most 3
  devices (`oreoOS/bonds.py`).
- `oreoWare/bt.py` also has central-role code (`scan_start`, `scan_results`,
  `start_pair`) for finding and pairing with other devices. No screen uses it
  at the moment.

### Receiving a file over BLE

GATT service `6f72656f-0000-1000-8000-00805f9b34fb` ("falera" in ASCII):

| Characteristic | UUID | Properties | Direction |
|---|---|---|---|
| RX | `6f72656f-0001-1000-8000-00805f9b34fb` | write, write-without-response (512 B buffer) | host -> badge |
| TX | `6f72656f-0002-1000-8000-00805f9b34fb` | notify | badge -> host, one status byte |

The bytes written to RX are concatenated into a single frame:

```
type (1 B) | length (4 B, big-endian) | payload (length B) | crc32(payload) (4 B, big-endian)
```

| type | payload | lands in |
|---|---|---|
| `T` | zlib/deflate-compressed UTF-8 text | `documents/bt_<time>.txt` (Reader app) |
| `M` | zlib/deflate-compressed Markdown | `documents/bt_<time>.md` (Reader app) |
| `I` | raw image bytes, at most 250 KB | `apps/gallery/assets/raw/bt_<time>.<ext>`, see limits |

Status bytes sent back on TX: `01` header accepted, `02` done, `E1` too large,
`E2` bad CRC, `E3` bad type, `E4` decompress failed, `E5` write failed, and
`E6` stalled (new in 2.0, see below). The badge also posts a notification when
a file arrives or is rejected.

`tools/bt_send.py` (Python + `bleak`, on a laptop) implements this protocol:

```
pip install bleak
python3 tools/bt_send.py notes.md
python3 tools/bt_send.py notes.txt
```

It scans for "Falera", writes 180-byte chunks without response, and waits up to
15 s for `02`.

## Issue #23: "Bluetooth file transfer stuck from phone"

The issue is closed. Its checklist asked for UI work: auto-discovery after
turning BT on, picking up nearby device names, a "Connect" footer, and pair
requests in both directions. After that, file transfer for phones moved to
WiFi, and the BT page became a placeholder.

Reading the receive code shows why a transfer could hang:

1. **No flow control.** The sender writes without response as fast as the
   stack accepts the writes. Each write runs a Python IRQ handler on the badge.
   If one write is dropped (a full event queue, or a phone that coalesces
   writes), the frame is short.
2. **No recovery from a short frame.** The reassembler waited forever for the
   missing bytes. Every later write, including a new attempt, was parsed as
   payload of the dead transfer. Only a disconnect reset it.
3. **The finished file is written inside the BLE IRQ callback**, after the
   whole payload has been buffered in RAM, which delays BLE event handling
   for the length of the flash write.

Changes in 2.0:

- A transfer that receives no bytes for `RX_STALL_MS` (5 s) is dropped. The
  badge sends `E6` on TX and posts a "BT transfer stalled" notification, and
  the next send starts from a clean state (point 2). Host test:
  `tests/test_bt_rx.py`.
- The Bluetooth page shows live link state and receive progress, so a stall
  can be seen on the badge.

Points 1 and 3 are still open (see next steps).

## Limits

- **No phone sender.** Phones can connect and pair, but sending a file means
  building the frame above by hand. Phones should use WiFi Send files.
- **Images are not usable over BLE.** `I` payloads are stored as raw
  PNG/JPG/GIF in `assets/raw/`. The Gallery only reads converted `.r565` /
  `.rz565` / `.rv565` files from `assets/optimized/`, and the badge cannot
  decode PNG/JPG, so these files never show up.
- **Slow.** Writes are 180 bytes each, without response, and each one passes
  through a Python IRQ handler. Throughput has not been measured on hardware;
  expect a few KB/s to a few tens of KB/s. WiFi Send files is far faster.
- **RAM-bound.** The whole payload is buffered in a growing `bytearray` before
  the CRC check. Images are capped at 250 KB, and text/Markdown has no explicit
  cap.
- **The RX characteristic does not require encryption.** While BT is on, any
  central in range can connect and push a `.txt` / `.md` without pairing. The
  badge only accepts text, Markdown and raw image bytes, and it shows a
  notification for each arrival, but this is still a gap.
- One peer at a time. BT is off after every reboot.

## Next steps

Concrete, in rough priority order:

1. **Flow control.** Have the badge send a credit/ack notification every N KB
   (for example `03` + the received count), and make `bt_send.py` wait for it.
   Alternatively, use write-with-response for one chunk in every N. This
   removes dropped writes, which are the root cause of #23.
2. **Stream to flash, outside the IRQ.** Append each write to a `.part` file
   and check the CRC incrementally (`binascii.crc32(data, crc)`). Rename the
   file when complete, from the run loop's `watchdog_tick()` rather than the
   IRQ. This gives flat RAM use and removes the size limits.
3. **Require encryption on RX** (`bluetooth.FLAG_WRITE_ENCRYPTED`, or
   authenticated writes) once pairing has been checked with iOS and Android
   phones.
4. **Web Bluetooth sender** on falera.elixpo.com: the same framing from a
   browser page (Chrome on Android and desktop; iOS Safari does not support Web
   Bluetooth). Reuse the WiFi page's in-browser image conversion, and add an
   `R` type for `.rz565` routed to `assets/optimized/`, so images work over
   BLE.
5. **BLE WiFi provisioning.** Let a paired phone send WiFi credentials over the
   encrypted link. This complements the 2.0 WiFi handoff, which needs the badge
   to already be on some network, and covers a badge that has none yet.
6. **Persist the BT on/off choice** in OS settings, and honour it in
   `init_from_config()`.
7. **Expose the central-role scan** in the Bluetooth page (nearby badges and
   devices), for badge-to-badge presence and IR-Quest assists.
8. **Measure on hardware:** throughput for 10 KB / 100 KB text files with
   `bt_send.py`, and the pairing flow on one iOS and one Android phone. Record
   the results here.
