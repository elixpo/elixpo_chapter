circuitpython-rv565
===================

Play `RV565 <https://github.com/elixpo/rv565>`_ video files on CircuitPython
displays.

RV565 stores video as frames whose decoded bytes are already in the
display's native pixel format (`format specification
<https://github.com/elixpo/rv565/blob/main/docs/FORMAT.md>`_,
`arXiv:2610.35935 <https://arxiv.org/abs/2610.35935>`_). This library reads
them in pure Python, inflating with CircuitPython's built-in ``zlib``, and
shows them with ``displayio`` or straight over an ST7789's bus.

It reads **format version 8** and **version 7**: all nine pixel formats
(``rgb565be``, ``rgb565le``, ``rgb444``, ``rgb666``, ``rgb888``, ``gray8``,
``gray4``, ``mono``, ``mono_vpage``), both codecs (stored and zlib), and
keyframes, XOR delta frames, partial deltas, region deltas (version 8) and
repeat frames with seeking through the keyframe interval. Both players redraw
only what changed: nothing for a repeat, only the changed bands of rows for a
partial delta, and only each changed band's range of columns for a region
delta. Version 6 files (RGB565 big-endian, zlib, every frame a keyframe) still
read. Which formats each player can show:

=================  ==================================================
Player             Pixel formats
=================  ==================================================
``Player``         ``rgb565be``, ``rgb565le``, ``gray8``, ``gray4``,
                   ``mono``
``DirectPlayer``   ``rgb565be``, ``rgb666`` (ST7789 in 18-bit mode)
``Clip.frame()``   all nine (raw bytes in the clip's format)
=================  ==================================================

Either player raises ``RV565Error`` naming the formats it supports for any
other clip.

**Status: experimental.** It passes host tests against every RV565
conformance vector (``tests/data/v7`` and ``tests/data/v8``) and, for
version 6 clips, plays on a
Raspberry Pi Pico 2 under CircuitPython 10.3.1 (measurements below). The
version 7 and 8 paths (stored frames, deltas, partial and region deltas,
repeats, ``rgb565le``, the grey and mono palettes, ``rgb666`` on
``DirectPlayer``, partial bitmap and window updates) are tested on a computer
only and have not yet run on a board.

Measured on a Raspberry Pi Pico 2 (RP2350, CircuitPython 10.3.1), playing
the 180x135, 24 FPS test pattern to a 320x240 ST7789 on SPI at 40 MHz
(2026-11-11). Every pixel showed the right colour with both players:

==================  =======  ===================  =================
Player              FPS      inflate per frame    draw per frame
==================  =======  ===================  =================
``Player``          8.0      51.0 ms              73.3 ms
``DirectPlayer``    16.5     47.7 ms              12.6 ms
==================  =======  ===================  =================

``DirectPlayer``'s draw is close to the SPI wire time (9.7 ms for the frame),
so inflating with CircuitPython's ``zlib`` (about 48 ms a frame, against about
16 ms for the C library's ``tinfl`` on the same chip) is what limits it.
Film clips compress less than the test pattern and inflate more slowly.

**Expect a fraction of the clip's rate, not 24.** The C library reaches 24 FPS by
inflating on one core while DMA sends the previous frame from the other.
Here, inflating and drawing happen one after the other in a single Python
thread, so a 180x135 clip will play at a fraction of its rate. Frames that
fall behind are skipped, so playback keeps the clip's timing, and
``Player.play()`` returns the frame rate it actually achieved. Use this
library to try RV565 without a C toolchain; use the C library when you need
the full frame rate.

Dependencies
------------

* CircuitPython 9 or later (8.x should work but is untested), on a board whose
  build includes ``zlib``, ``displayio`` and ``bitmaptools``. Most ESP32-S3
  and RP2350 builds include all three; check the
  `module support matrix
  <https://docs.circuitpython.org/en/latest/shared-bindings/support_matrix.html>`_
  for your board.
* `adafruit_st7789 <https://github.com/adafruit/Adafruit_CircuitPython_ST7789>`_,
  only for the examples that drive an external ST7789.

Installing on a CircuitPython board
-----------------------------------

1. Copy ``circuitpython_rv565.py`` to the ``lib`` folder on your
   ``CIRCUITPY`` drive. (To save RAM, compile it first with the
   ``mpy-cross`` that matches your CircuitPython version and copy
   ``circuitpython_rv565.mpy`` instead.)
2. Copy a clip to ``CIRCUITPY``. To start, use the test pattern,
   ``tests/data/testpattern.rv565`` in the RV565 repository (180x135,
   24 FPS, 24 frames, 6 KB).
3. Copy one of the files in ``examples/`` to ``CIRCUITPY`` as ``code.py``.
   For an external ST7789, also copy ``adafruit_st7789.mpy`` from the
   `Adafruit bundle <https://circuitpython.org/libraries>`_ into ``lib``.

Once the library is in the Community Bundle, ``circup install rv565`` will do
step 1.

Making clips
------------

Use the `online converter <https://falera.elixpo.com/rv565/convert/>`_, which
runs in your browser, or the Python tool::

    pip install rv565
    rv565 encode input.mp4 clip.rv565 --size 180x135 --fps 12
    rv565 verify clip.rv565

Because this library will not reach 24 FPS, a lower rate such as 8 or 12 FPS
wastes less of the file on frames that will be skipped. Keep clips at 180x135
or smaller on boards without PSRAM, such as the Pico 2: a 320x240 frame needs
150 KiB inflated and as much again for the bitmap (see `Memory`_).

Choosing a format for this library: ``rgb565be`` with ``K`` = 1 is what has
been measured on a board. A keyframe interval above 1 makes files smaller
and adds a delta frame's XOR (see `Memory`_ and `Delta frames and speed`_),
and repeats cost nothing to play. The stored codec skips inflating
altogether, at the cost of reading a whole frame from flash or SD per frame.

Usage
-----

.. code-block:: python

    import board
    import circuitpython_rv565 as rv565

    clip = rv565.open("/clip.rv565")        # path, file object or bytes
    print(clip.width, clip.height, clip.fps, len(clip))

    player = rv565.Player(clip, board.DISPLAY)
    stats = player.play()                   # paced to clip.fps, late frames skipped
    print(stats)  # <PlayStats x.xx of 24 FPS: n shown, m skipped ...>

``rv565.open()`` reads and checks only the header (``clip.version``,
``clip.pixel_format``, ``clip.codec``, ``clip.keyframe_interval`` and the
size, rate and frame count). The frame index is built on first use with one
pass over the record headers (5 bytes of RAM per frame), which also validates
the rest of the container as the format requires: lengths, trailing bytes,
frame types (region deltas only in version 8 files), a keyframe at every
multiple of ``K``, empty repeats, each partial or region delta's band height,
band mask, shifts and (region) byte ranges, and exact-size stored frames. Call ``clip.build_index()`` to do that before
playback. Frames are read from the file one at a time, so a clip on
CIRCUITPY or an SD card does not have to fit in RAM.

``clip.frame(i)`` returns frame ``i`` as bytes in the clip's pixel format
(``clip.frame_bytes`` of them) and raises ``RV565Error`` if a zlib body does
not inflate to exactly that many bytes. The result is the clip's own frame
buffer, overwritten by the next call: copy it with ``bytes()`` to keep it.
Decoding the next frame applies one record; a seek starts at the latest
keyframe at or before ``i`` and applies at most ``K - 1`` records.
``clip.frame_type(i)`` is ``"key"``, ``"delta"``, ``"repeat"``,
``"partial"`` or ``"region"``. ``clip.changed_lines(i)`` lists the line runs
``(first, count)`` frame ``i`` changes (every line for a keyframe or delta,
none for a repeat, the changed bands for a partial or region delta; lines are
pixel rows, or pages of 8 rows for ``mono_vpage``), read from the band mask
without decoding. ``clip.changed_rects(i)`` lists rectangles ``(first line,
line count, first byte, byte count)``: for a region delta one per changed
band, covering only its byte range, otherwise the same runs across whole
lines; ``clip.columns(first_byte, byte_count)`` turns a byte range into
``(first column, column count)`` of pixels. ``clip.dirty_lines(since, i)``
merges line runs over several frames: what changed between a picture on
screen and frame ``i``, which the players use after skipping frames;
``clip.dirty_rects(since, i)`` is the same as rectangles (a region delta's
own rectangles when it is the only frame in between that is not a repeat,
whole lines otherwise).

Memory
------

All figures for a 180x135 clip (``S`` = 48,600 bytes in RGB565):

* **Index:** 4 bytes per frame for record offsets, plus 1 per frame for the
  frame types in versions 7 and 8.
* **Frame buffer:** one ``bytearray`` of ``S`` bytes, allocated on the first
  decode and reused for every frame.
* **Keyframes and deltas, zlib:** ``zlib.decompress`` returns a new ``S``-byte
  object each frame (CircuitPython's ``zlib`` cannot inflate into an
  existing buffer), plus the compressed body read from the file. A keyframe
  is copied into the frame buffer; a delta is XORed into it in place. Peak:
  about ``2 S`` plus the body, the same for keyframes and deltas.
* **Partial deltas:** the inflate output is only as large as the changed
  bands, and is XORed into those bands of the frame buffer in place; the
  rest of the frame is not touched. A band with a shift (``dx``, ``dy``) is
  first predicted from a copy of itself, so shifted bands need one band of
  scratch (band height x line bytes, allocated once) and one line of
  zeros. A stored partial delta read from a file
  uses the start of the scratch buffer below.
* **Region deltas:** the same as partial deltas, over each changed band's
  byte range only: the inflate output is the size of the ranges, and a
  shifted band copies only the columns its range predicts from (at most one
  band of scratch, shared with partial deltas).
* **Stored codec:** a keyframe read from a file goes straight into the frame
  buffer with ``readinto``, with no other allocation; a stored delta needs
  one more ``S``-byte scratch buffer, allocated once. Clips passed as
  ``bytes`` need no scratch buffer.
* **XOR:** works in 2 KiB chunks, so it allocates a few short-lived 2 KiB
  objects per chunk rather than anything frame-sized.
* **Player:** the ``displayio.Bitmap`` adds ``S`` for RGB565 (2 bytes per
  pixel), ``w x h`` for ``gray8``, and less for ``gray4`` and ``mono``
  (CircuitPython stores them at 4 and 1 bits per pixel). Some ports copy the
  frame into the ``io.BytesIO`` that ``bitmaptools.readinto`` reads from,
  which can add another ``S`` while drawing.
  Partial updates add two small scratch bitmaps (8 rows and 1 row of the
  clip's width; 2.9 KiB and 360 bytes at 180 wide in RGB565).
* **DirectPlayer:** no bitmap; it sends the frame buffer itself, or slices
  of it for partial deltas. A region delta's window is not contiguous in the
  frame, so its lines are gathered into one buffer of at most 4 KiB (or one
  range, if longer), allocated once, and sent in as many writes as needed.

So ``Player`` with a 180x135 RGB565 zlib clip needs roughly 150 to 200 KiB
of heap at its peak (frame buffer, inflate output, bitmap, and possibly the
``BytesIO`` copy), and ``DirectPlayer`` roughly 100 KiB; a Pico 2 has room
for either, smaller boards without PSRAM may not. Version 1 of this library
needed one ``S`` less, since it kept no frame buffer between frames.

Delta frames and speed
----------------------

A delta frame costs its inflate plus one XOR over the whole frame. On boards
with long integers (all ESP32-S3 and RP2350 builds) the XOR runs in C:
each 2 KiB chunk becomes two integers with ``int.from_bytes``, is XORed, and
is written back with ``to_bytes``. Boards without long integers fall back to
a Python loop over every byte, which is much slower. Neither has been timed
on a board yet; expect the long-integer XOR to cost a few milliseconds per
180x135 frame, small next to the inflate.

When playback falls behind, frames are skipped, but a skipped delta still has
to be applied to reach the next frame shown (at most ``K - 1`` of them, back
to the last keyframe), so a long keyframe interval saves less time than it
saves space on a slow board. Repeat frames are neither decoded nor drawn.

A partial delta costs its (smaller) inflate plus XOR over its changed bands
only (plus, for a shifted band, one copy of the band and a slice copy per
line), and the players send only those rows: ``DirectPlayer`` sets the row
window and writes each run of changed bands, and ``Player`` copies only those
rows into the bitmap, so ``displayio`` refreshes only that area. After
skipped frames both draw the union of the rows the skipped frames changed.
A region delta costs inflate and XOR over its ranges only, and the players
draw only those: ``DirectPlayer`` sets a column and row window per changed
band, and ``Player`` copies only those columns of the band's rows into the
bitmap. After skipped frames they fall back to whole rows.
``PlayStats.rows_updated`` counts the rows drawn and
``PlayStats.pixels_updated`` the pixels. On these boards the display
transfer is a large part of each frame, so clips that change little per
frame (user interfaces, slides, animations on a still background) gain the
most.

How a frame reaches the display
-------------------------------

``Player`` copies each decoded frame into a ``displayio.Bitmap`` with one
``bitmaptools.readinto()`` call; boards without it fall back to a much slower
per-pixel loop. When only some rows changed (a partial delta), it reads those
rows into a small scratch bitmap with ``readinto`` and copies it into place
with ``bitmaptools.blit`` (``Bitmap.blit`` on CircuitPython 8), 8 rows at a
time, so only those rows of the bitmap are marked dirty. For a region delta it
blits only each band's range of columns, so only that window is dirty.

* ``rgb565be``: a 65536-value bitmap drawn through
  ``ColorConverter(input_colorspace=Colorspace.RGB565_SWAPPED)``. The bitmap
  stores each value as a little-endian 16-bit word, so copying the file's
  big-endian bytes in unchanged gives byte-swapped values, which is exactly
  what ``RGB565_SWAPPED`` describes (the same convention ``gifio`` uses).
* ``rgb565le``: the same bitmap through ``Colorspace.RGB565``.
* ``gray8``, ``gray4``, ``mono``: a 256-, 16- or 2-value bitmap through a
  grey ``displayio.Palette`` (``mono``: 0 black, 1 white), read with
  ``bits_per_pixel`` 8, 4 or 1 and ``reverse_pixels_in_element=True`` so the
  first pixel comes from the high bits, as the format stores it.

``DirectPlayer`` (experimental) skips ``displayio``: since RV565 bytes are
already what an ST7789 expects, it sets the address window and sends each
frame with one ``bus.send()``; for a partial delta it sends one row window
(RASET) and one write per run of changed bands instead, and for a region
delta one column and row window (CASET and RASET) per changed band, covering
its byte range: columns ``x0 / A * p`` to ``(x0 + xw) / A * p - 1``. ``rgb565be`` clips go to the panel as
``adafruit_st7789`` set it up; for ``rgb666`` clips it also switches the
controller to 18-bit pixels (COLMOD ``0x66``) while playing and back to
``0x55`` afterwards (``restore_colmod=``; untested on a board). It should be considerably faster, but it needs
the display to be initialised first (for example by ``adafruit_st7789``) and
takes the panel over while playing. ``displayio`` rotation is done in
software and never reaches the controller, so for a landscape panel
``DirectPlayer`` sets MADCTL to ``0x60`` (the value the RV565 C and
MicroPython benchmarks use) before playing and back to ``0xC0``
(``adafruit_st7789``'s value) afterwards; pass ``madctl=`` and
``restore_madctl=`` for other orientations or drivers. Modules smaller than
the controller's 240x320 RAM need ``x_offset``/``y_offset`` as well. This
path is checked on a Pico 2 with the benchmark's 320x240 ST7789 module:
timing above, and colours, orientation and position correct with the
default ``madctl=0x60`` and no offsets.

Examples
--------

* ``rv565_simpletest.py``: any board with ``board.DISPLAY``.
* ``rv565_pico2_st7789.py``: Raspberry Pi Pico 2 with a 2.0" 320x240 ST7789
  on SPI0 (SCK GP18, MOSI GP19, CS GP17, DC GP20, RST GP21, BL GP22, the
  wiring of the RV565 Pico 2 benchmark).
* ``rv565_pico2_direct.py``: the same wiring with ``DirectPlayer``.
* ``rv565_esp32s3_tft.py``: Adafruit ESP32-S3 TFT Feather (built-in 240x135
  ST7789).

Testing on a computer
---------------------

The tests run with CPython and stand-ins for ``displayio`` and
``bitmaptools``::

    python3 -m unittest discover -s ports/circuitpython/tests -v

They check the reader against every conformance vector in
``tests/data/v7`` and ``tests/data/v8`` (each frame's SHA-256 from ``manifest.json``, decoded in
order and by random seeks, from bytes and from a file; every invalid file
rejected when opened and indexed, or when decoded, as the manifest says) and
against ``tests/data/testpattern.rv565``; that the bitmap shows the right
colour for every pixel in each format ``Player`` supports (compared with the
reference package's ``to_rgb888``); each frame's ``changed_lines`` and
``changed_rects`` against the manifest; frame pacing, skipping and repeats;
that partial deltas mark only their changed rows of the bitmap dirty, and
region deltas only their windows; and, through a model of the panel's memory,
that the windows and bytes ``DirectPlayer`` sends leave exactly the frame on
the panel while sending fewer bytes for partial and region deltas.

Submitting to the Community Bundle
----------------------------------

The library is laid out like an Adafruit cookiecutter library so it can move
out unchanged now that it has run on hardware:

1. Create a repository named ``CircuitPython_RV565`` with the contents of
   this folder (the module, ``examples/``, ``docs/``, ``tests/``,
   ``pyproject.toml``, ``requirements.txt``, ``LICENSE``), or regenerate it
   with ``cookiecutter gh:adafruit/cookiecutter-adafruit-circuitpython``
   (library name ``RV565``, target bundle *Community*) and copy the code in.
2. Add the cookiecutter's CI (pre-commit with black and pylint, Sphinx docs
   build, ``circuitpython-build-tools``) and make it pass; switch
   ``__version__`` to ``"0.0.0+auto.0"`` so the bundle tooling stamps
   releases.
3. Tag a release (GitHub release, semver).
4. Open a pull request on
   `CircuitPython_Community_Bundle
   <https://github.com/adafruit/CircuitPython_Community_Bundle>`_ adding the
   repository as a submodule under ``libraries/drivers`` (or ``helpers``),
   following its README.
5. Optionally publish to PyPI as ``circuitpython-rv565`` (the name the
   ``pyproject.toml`` already uses).

License
-------

MIT; see ``LICENSE``.
