# SPDX-FileCopyrightText: 2026 Ayushman Bhattacharya
# SPDX-License-Identifier: MIT
"""Play an RV565 clip on a board with a built-in display (board.DISPLAY).

Copy circuitpython_rv565.py to CIRCUITPY/lib and testpattern.rv565 (from
tests/data in the RV565 repository) to CIRCUITPY, then run this as code.py.
"""

import board

import circuitpython_rv565 as rv565

clip = rv565.open("/testpattern.rv565")
print("RV565 %dx%d, %d FPS, %d frames" % (clip.width, clip.height, clip.fps, len(clip)))

player = rv565.Player(clip, board.DISPLAY)
while True:
    stats = player.play()
    print(stats)  # achieved FPS, skipped frames, inflate and draw time per frame
