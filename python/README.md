# rv565 for Python

[![PyPI](https://img.shields.io/pypi/v/rv565.svg)](https://pypi.org/project/rv565/)
[![Python](https://img.shields.io/pypi/pyversions/rv565.svg)](https://pypi.org/project/rv565/)

Read, write and check [RV565](https://github.com/elixpo/rv565) video files:
independently zlib-compressed RGB565 frames, the format the RV565 library
plays at 24 FPS on ESP32-S3 SPI displays
([arXiv:2610.35935](https://arxiv.org/abs/2610.35935)).

```bash
pip install rv565            # core and the `rv565` command, no dependencies
pip install "rv565[pillow]"  # plus the Pillow plugin
```

Published on PyPI: [pypi.org/project/rv565](https://pypi.org/project/rv565/).
Prefer not to install anything? The
[online converter](https://oreo.elixpo.com/rv565/convert/) does the same
encoding in your browser.

## Command line

```bash
rv565 encode input.mp4 clip.rv565 --size 180x135 --fps 24   # needs FFmpeg
rv565 info clip.rv565        # sizes and predicted missed frames on ESP32-S3
rv565 verify clip.rv565
rv565 c-array clip.rv565 clip.h   # for Arduino sketches
```

## Library

```python
import rv565

clip = rv565.open("clip.rv565")
print(clip.width, clip.height, clip.fps, len(clip))
frame = clip.frame(0)                     # RGB565 big-endian bytes, O(1) seek
report = clip.check_schedule(overlap=True)
print(report.late_frames)                 # 0: plays without misses (ESP32-S3 model)

rv565.write("out.rv565", 180, 135, 24, frames)   # frames: RGB565BE bytes each
```

## Pillow

```python
import rv565.pillow                       # registers the format
from PIL import Image, ImageSequence

with Image.open("clip.rv565") as im:      # mode "RGB", im.n_frames, im.info["fps"]
    frames = [f.copy() for f in ImageSequence.Iterator(im)]

frames[0].save("out.rv565", save_all=True, append_images=frames[1:], fps=24)
```

Any image sequence Pillow can open (GIF, APNG, WebP) can be saved as RV565 the
same way; colours are reduced to RGB565.

## License

MIT.
