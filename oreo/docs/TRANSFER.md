# Transfer: files from a computer to the badge

**Transfer** is a built-in app that receives photos, videos and documents
from a computer over the USB cable. The computer side is
[`falera transfer`](CLI.md#falera-transfer-send-files-to-the-transfer-app) in
falera-cli. Before you send anything, you type a six-character code that only
the badge shows, much like a device-login code. FaleraOS keeps running the
whole time.

Transfer replaces the old **Send Files** page in Settings > WiFi and the
upload web page. Wi-Fi on the badge is now for the internet only (App Store,
updates, GitHub data, weather, time). Bluetooth sharing is planned last
(#101, #103, #124).

- [For users](#for-users)
- [For developers](#for-developers): [design](#design),
  [the protocol](#the-protocol), [the badge side](#the-badge-side),
  [the computer side](#the-computer-side), [tests](#tests)

## For users

### Send files

1. Plug the badge into the computer with a data cable. On the breadboard
   build, use the port labelled **USB** (see [USB.md](USB.md)).
2. On the badge, open the apps drawer, then **Tools > Transfer**. The screen
   shows a code such as `K7M2QX`. Once the computer has recognised the
   badge on the cable it says *Computer connected over USB* (otherwise
   *Waiting for a computer...*).
3. On the computer ([install falera-cli](CLI.md#install) first):

   ```sh
   falera send holiday.jpg clip.mp4 talk-notes.md     # the same as: falera transfer send ...
   ```

4. The badge changes to *Connected: \<your computer's name\>*, and the
   computer asks for the code. Type it. Upper or lower case, with or without
   spaces or dashes, all work.
5. A progress bar shows each file on the badge as it arrives. When a file is
   checked and saved, the badge shows **OK** next to it and a notification:
   - photos and videos go to the **Gallery**;
   - documents go to the **Reader**.
6. When the command ends, the badge goes back to waiting and shows a **new**
   code.

You can also list and remove what Transfer manages:

```sh
falera transfer list               # photos, videos and documents on the badge, with free space
falera transfer rm holiday.rz565   # asks first
```

Every option, and what is converted to what, is in
[CLI.md](CLI.md#falera-transfer-send-files-to-the-transfer-app).

### On the badge

| Screen | What it means |
|---|---|
| Code, *Waiting for a computer...* | Ready, but no computer is on the USB port yet (or this FaleraOS cannot tell). Plug the cable into a computer |
| Code, green dot, *Computer connected over USB* | A computer has recognised the badge. Run `falera send <files>` on it |
| *Connected: \<name\>*, *Type this code on the computer* | A computer is there and has not typed the code yet. After a wrong code it shows how many tries are left |
| Green dot, *Ready. Send files from the computer.* | Code accepted |
| *Receiving \<file\>*, progress bar | A file is arriving |
| *TOO MANY WRONG CODES*, countdown | Locked after 5 wrong codes; a new code appears after 60 s |

If the cable is pulled during a session, the badge ends it within about
two seconds (*computer unplugged* in the list), shows a new code and waits
again.

| Button | Effect |
|---|---|
| **B** | Cancel the session while a computer is connected; otherwise leave the app |
| **RIGHT** | Draw a new code (only when no computer is connected) |
| **HOME** | Leave the app. Leaving always ends the session |

The last few results stay listed at the bottom of the screen (**OK** or
**!!**). While a computer is connected, the badge does not go to sleep.

### Safety

- **Nobody can send files without seeing the badge.** The code appears only
  on the badge's screen. It is never sent over USB, and nothing can be
  written until it has been typed.
- **Codes are random and change.** Each code is 6 characters from a 32-letter
  alphabet (about a billion combinations), drawn from the ESP32-S3's hardware
  random number generator. Every session gets a new one. 0, O, 1, I and L
  are never used, so they cannot be confused.
- **Guessing is stopped.** After 5 wrong codes the badge locks for 60
  seconds and then draws a new code.
- **No half files.** A file is written under a temporary `.part` name. It
  is renamed into place only after its SHA-256 matches and its header is
  valid for the Gallery or the Reader. A cut cable, a cancel or a damaged
  chunk leaves the old file, if any, untouched.
- **Only media and documents.** Transfer accepts only photos, videos and
  documents, and only into the Gallery and documents folders. It cannot
  write apps, FaleraOS files or any other path.
- **No network.** Transfer uses only the USB cable; it never turns on Wi-Fi
  or Bluetooth.

### While Transfer is open

While it is open, Transfer reads the USB console, and other `falera` commands
cannot pause FaleraOS. Leave Transfer (**HOME**) before running `falera info`,
`falera add`, `falera shell`, `falera update` and the rest; otherwise they fail with
"the badge did not answer". `falera logs` still works, and shows the app's
`@OTB` lines.

## For developers

### Design

| Piece | File |
|---|---|
| The app (screens, buttons) | [`apps/transfer/src/app.py`](../apps/transfer/src/app.py) |
| Is a computer on the USB port? | [`oreoOS/usbhost.py`](../oreoOS/usbhost.py) |
| Reading the USB console without blocking | [`apps/transfer/src/link.py`](../apps/transfer/src/link.py) |
| The protocol, badge side; no screen or hardware access | [`apps/transfer/src/proto.py`](../apps/transfer/src/proto.py) |
| The protocol, computer side, and `falera transfer` | [`cli/oreo_cli/transfer.py`](../cli/oreo_cli/transfer.py) |

The badge's native USB port is a single serial stream. MicroPython's REPL,
`print()` output and FaleraOS logs all share it. `falera add` and `falera push` use
the stream by sending Ctrl-C to stop FaleraOS and then driving the raw REPL.
Transfer works the other way round: FaleraOS keeps running, and the app reads
`sys.stdin` itself while it is open. (Nothing else reads it while FaleraOS
runs.) Each side marks its own lines with a prefix and ignores every other
line, so log output, a REPL echo or a stray byte cannot be mistaken for
protocol data.

### Detecting the computer on USB

`oreoOS/usbhost.py` answers "is a computer on the USB port?" and the app
asks it once a second (`usbhost.Probe`).

MicroPython 1.28's ESP32-S3 port gives Python no way to ask: TinyUSB's
`tud_mounted()`, `tud_ready()` and `tud_cdc_connected()` (DTR) are used
only inside the C console code (`shared/tinyusb/mp_usbd_cdc.c`);
`machine.USBDevice` exists on this port but only offers `config()`,
`active()`, `submit_xfer()`, `stall()` and `remote_wakeup()`, none of which
report the host, and reconfiguring it would drop the console; and
`sys.stdout` writes and `select.poll()` behave the same with or without a
host (without one, TinyUSB just overwrites its buffer).

So `usbhost` reads the USB controller's own registers with
`machine.mem32`. The ESP32-S3's USB OTG controller (a Synopsys DWC2 core,
ESP-IDF's `USB_DWC` at `0x60080000`) has:

| Register | Bits | Meaning |
|---|---|---|
| DCFG `0x60080800` | DEVADDR, 4..10 | The address the host gave the badge while enumerating it. Cleared on every bus reset |
| DSTS `0x60080808` | SUSPSTS, 0 | The bus has been idle for 3 ms (suspended) |
| DSTS `0x60080808` | SOFFN, 8..21 | Number of the last start-of-frame packet; a host sends one every 1 ms |

A computer is connected when the address is set, the bus is not suspended,
and the frame number moves within 2 ms. That matches TinyUSB's "mounted"
(enumerated and configured). Reading these registers has no side effects;
a check costs two or three reads and at most 2 ms.

Limits:

- It cannot tell whether a program on the computer has the port open
  (DTR), only that the computer enumerated the badge. The screen therefore
  says what to run rather than "the CLI is connected"; that is still shown
  after `hello` (*Connected: \<name\>*).
- A computer that sleeps, or that suspends the USB port to save power,
  reads as unplugged until it wakes. A session in progress keeps the port
  awake.
- A charger or a charge-only cable reads as unplugged.
- The badge has no VBUS sense pin; unplugging shows up as the bus going
  idle, which the controller flags within 3 ms.
- Only on an ESP32-S3 with the TinyUSB console (the Falera Badge firmware,
  ESP32_GENERIC_S3). Elsewhere `connected()` returns None, and Transfer
  shows *Waiting for a computer...* as before.

A firmware module exposing `tud_mounted()` and `tud_cdc_connected()`
would add DTR, but it is not needed for this screen and is not part of the
firmware.

### The protocol

Version 1. One message per line, ASCII only, ending in `\n`:

| Direction | Line | Meaning |
|---|---|---|
| computer → badge | `@OTH {json}` | A command |
| computer → badge | `@OTD <seq> <base64>` | One chunk of the file being sent |
| badge → computer | `@OTB {json}` | A reply or an event |

Every JSON object has an `op`. A session:

```text
badge     announce {v, app}                 when the app opens, every 2 s while it waits,
                                            and every 2 s while a session is idle with no file on its way
computer  hello {v, host, client, id}    →  hello {v, app, id, os, chunk, max, free, reserve, locked_s, tries}
computer  auth {code}                    →  ok | error auth {left} | error locked {retry_s}
computer  put {name, size, sha256}       →  ready {name, kind, chunk}
computer  @OTD 0 <base64> ...            →  ack {seq, got} per chunk
                                         →  done {name, kind, path, size, replaced, free} | error
computer  abort                          →  aborted         (drops the half-sent file)
computer  list                           →  list {files: [{name, kind, size}], free}
computer  del {name}                     →  deleted {name, free}
computer  ping                           →  pong
computer  bye                            →  bye             (the session ends and the code changes)
```

Rules:

- **Hello only after an announce.** The computer writes nothing until it has
  seen an `announce`. It then answers each announce with at most one hello
  per second. The reason: while the app is closed, nothing reads the USB
  stream. MicroPython keeps unread bytes in a 260-byte ring buffer (259
  usable), and it checks for Ctrl-C only as each byte enters that buffer.
  Two or three unanswered hellos (84 to 102 bytes each) would fill it, and
  the Ctrl-C that `falera add`, `falera shell` or `mpremote` sends later would
  then never arrive until the badge was reset.
- **Taking over a stale session.** If a CLI is killed mid-session, the badge
  keeps announcing while the session is idle (no line for 2 s and no file on
  its way). The next `falera transfer` therefore gets an announce, says hello,
  and takes the session over. A new hello always resets the session state
  and drops any half-received file. The CLI ignores announces in the middle
  of its own session.
- **One file at a time.** A `put` names the file, its size and its SHA-256.
  Chunks carry up to `chunk` bytes (3072) of the file each, which is 4096
  base64 characters, and are numbered from 0. The computer keeps up to 4
  chunks in flight before it waits for an `ack`. A chunk out of order,
  damaged, empty, too big or past the declared size fails the file.
- **Checking a file.** After the last chunk, the badge compares the SHA-256
  and checks the header with the same rules the Gallery and Reader use:
  - R5Z v1 or R565 photos up to 320×240;
  - RV565 v1 to v6 videos, with the frame sizes checked for v5 and v6;
  - the `ODZ\x01` header for `.mdz` and `.txtz`.

  Only after both checks pass does it rename `<name>.part` into place.
- **The code.** The badge compares codes in constant time, ignoring case,
  spaces, dashes, underscores and tabs. The code itself never crosses the
  wire from the badge.
- **Version check.** A hello with another `v` gets `error version {v}`, and
  the CLI reports that the two need updating to matching versions.

Error codes (`error {code, msg, ...}`). The ones marked *fatal* end the
session on the computer; the others fail only the current file:

| Code | Meaning |
|---|---|
| `version` *(fatal)* | Different protocol version |
| `hello` *(fatal)* | A command arrived before hello |
| `need_auth` *(fatal)* | A command that needs the code arrived before it |
| `locked` *(fatal)* | Too many wrong codes; `retry_s` says how long to wait |
| `cancelled` *(fatal)* | **B** was pressed on the badge |
| `closed` *(fatal)* | The app was left |
| `timeout` *(fatal)* | The computer was silent too long |
| `proto` *(fatal)* | Unreadable JSON or an unknown op |
| `auth` | Wrong code; `left` tries remain (the CLI asks again if it can) |
| `busy` | A `put` while a file is already arriving |
| `name` | Empty or unusable file name |
| `type` | Not a photo, video or document extension |
| `size`, `sha` | A bad `size` or `sha256` field |
| `too_big` | Over `max` (8 MiB) |
| `no_space` | `size` plus the 256 KiB reserve is more than the free space |
| `data`, `seq`, `line` | Damaged, out of order or over-long chunk line |
| `hash` | SHA-256 mismatch; file dropped |
| `invalid` | The header is not a valid photo, video or document |
| `io` | The filesystem refused to open, write, rename or delete |
| `missing` | `del` of a file that is not there |

Limits (`proto.py`):

| Constant | Value | Meaning |
|---|---|---|
| `CHUNK` | 3072 | File bytes per data line |
| `MAX_LINE` | 4400 | Longest line accepted; longer lines are dropped |
| `MAX_FILE` | 8 MiB | Largest single file |
| `RESERVE` | 256 KiB | Flash kept free for FaleraOS (the same as `falera add`) |
| `MAX_TRIES` / `LOCK_MS` | 5 / 60 s | Wrong codes before a lockout, and its length |
| `ANNOUNCE_MS` | 2 s | Announce interval |
| `IDLE_HELLO_MS` / `IDLE_AUTHED_MS` / `IDLE_PUT_MS` | 5 min / 2 min / 20 s | Silence allowed before the code, after it, and mid-file |

File names are reduced to a plain name: no folders, printable ASCII, at most
64 characters, not hidden and not ending in `.part`. The extension decides
where the file goes:

| Extension | Folder | Kind |
|---|---|---|
| `.rz565`, `.r565` | `apps/gallery/assets/optimized` | image |
| `.rv565` | `apps/gallery/assets/optimized` | video |
| `.mdz`, `.txtz`, `.md`, `.txt` | `documents` | document |

The badge accepts plain `.md` and `.txt` files. The CLI converts them to
`.mdz` and `.txtz` before sending.

### The badge side

`proto.Receiver` holds the session: the code, at most one computer, and one
file at a time. The app feeds it complete lines and calls `tick()` once per
frame. It has four states: `waiting`, `hello`, `authed` and `receiving`.

`link.UsbLink`:

- **On open**, it calls `micropython.kbd_intr(-1)`, so no byte on the
  stream can raise `KeyboardInterrupt` inside FaleraOS. It then throws away
  anything queued before the app opened.
- **On close**, it turns Ctrl-C back on.
- **Reading never blocks.** `select.poll()` confirms a byte is waiting before
  each one-byte `readinto()`. Each frame reads for at most 25 ms, so the
  buttons and screen stay responsive.
- **Nothing is lost.** MicroPython's stdin cannot say how many bytes are
  waiting, so bytes are taken one at a time. The USB stack holds the rest
  back, and the computer's writes wait until the app catches up.

While a computer is connected, the app:

- asks the launcher for real-time frames (`realtime_mode()`), so there is no
  network housekeeping;
- sets `BLOCK_IDLE`, so the badge does not sleep.

After each file it pushes a notification that opens the Gallery or the
Reader. Transfer is listed in the **Tools** category
(`oreoOS/config.py`) and is protected from removal in `oreoOS/store.py`.

### The computer side

`oreo_cli.transfer.Client` speaks the protocol on an open pyserial port.
`falera transfer` works in this order:

1. Converts and validates every file first, with the same converters as
   `falera add`. Files already in a badge format are only validated.
2. Opens the port without resetting the badge and without the raw REPL.
3. Waits for an announce, says hello, then asks for the code.
4. Sends the files one by one with a progress bar.
5. Says `bye` and closes the port. Nothing is restarted.

On Ctrl-C it sends `abort` and `bye`. A write timeout means the app stopped
reading the port, and is reported as "the badge stopped reading the USB
port".

Other programs can implement the protocol too. A minimal sender needs only
these steps:

1. Read lines until one contains `@OTB {"op": "announce", ...}`.
2. Write `@OTH {"op":"hello","v":1,"host":"me","client":"x","id":"1"}`.
3. Write `@OTH {"op":"auth","code":"<code>"}`.
4. For each file, write a `put`, then the `@OTD` lines, waiting for an `ack`
   at least every 4 chunks, then wait for `done`.
5. Write `bye`.

### Tests

These run without a badge:

```sh
python3 -m unittest tests.test_transfer_proto                       # the badge side on its own
python3 -m unittest discover -s tests -p 'test_busy_hostui_usb.py'  # usbhost against fake registers
python3 -m unittest discover -s cli/tests -p 'test_transfer.py'      # the real CLI client against the real proto.py
```

`cli/tests/test_transfer.py` models MicroPython's 259-byte stdin buffer, so it
catches any change that would write to a closed app.

Things only a badge can show are listed under
[Testing on a badge](CLI.md#testing-on-a-badge), item 9. Speed in particular
has not been measured on a badge yet.
