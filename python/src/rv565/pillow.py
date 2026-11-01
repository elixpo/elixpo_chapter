"""Pillow plugin: open and save RV565 files as animations.

    import rv565.pillow  # registers the format with Pillow
    from PIL import Image, ImageSequence

    with Image.open("clip.rv565") as im:
        print(im.size, im.n_frames, im.info["fps"])
        for frame in ImageSequence.Iterator(im):
            ...

    frames[0].save("out.rv565", save_all=True, append_images=frames[1:], fps=24)

Frames decode to mode "RGB". Saving converts to RGB565, so colours keep 5-6-5
bits. ``fps`` (1-30) defaults to 24, or is taken from ``duration`` (ms) if
given; ``level`` sets the zlib level (default 1).
"""

from array import array

from PIL import Image, ImageFile

from . import MAGIC, RV565Error, open as open_clip, rgb888_to_rgb565be, write


def _accept(prefix):
    return prefix[:3] == MAGIC


class RV565ImageFile(ImageFile.ImageFile):
    format = "RV565"
    format_description = "RV565 frame-independent RGB565 video"

    def _open(self):
        try:
            self._clip = open_clip(self.fp.read())
        except RV565Error as exc:
            raise SyntaxError(str(exc)) from None
        h = self._clip.header
        self._mode = "RGB"
        self._size = (h.width, h.height)
        self.info["fps"] = h.fps
        self.info["duration"] = 1000.0 / h.fps
        self.info["loop"] = 0
        self.n_frames = h.frames
        self.is_animated = h.frames > 1
        self._frame = -1
        self.tile = []
        self._load_frame(0)

    def _load_frame(self, index):
        swapped = array("H")
        swapped.frombytes(self._clip.frame(index))
        swapped.byteswap()  # big-endian pairs -> the little-endian layout "BGR;16" unpacks
        self.im = Image.core.new(self.mode, self.size)
        self.frombytes(swapped.tobytes(), "raw", "BGR;16")
        self._frame = index

    def seek(self, frame):
        if not self._seek_check(frame):
            return
        self._load_frame(frame)

    def tell(self):
        return self._frame


def _frames(im, append_images):
    seen = [im] + list(append_images or [])
    for image in seen:
        for i in range(getattr(image, "n_frames", 1)):
            if getattr(image, "n_frames", 1) > 1:
                image.seek(i)
            yield image.convert("RGB")


def _fps(info, encoderinfo):
    if "fps" in encoderinfo:
        fps = encoderinfo["fps"]
    elif "duration" in encoderinfo:
        duration = encoderinfo["duration"]
        if isinstance(duration, (list, tuple)):
            duration = duration[0]
        fps = round(1000.0 / duration)
    else:
        fps = info.get("fps", 24)
    return max(1, min(30, int(fps)))


def _save(im, fp, filename, save_all=False):
    enc = im.encoderinfo
    frames = _frames(im, enc.get("append_images")) if save_all else [im.convert("RGB")]
    width, height = im.size

    def packed():
        for frame in frames:
            if frame.size != (width, height):
                raise ValueError("all frames must be %dx%d" % (width, height))
            yield rgb888_to_rgb565be(frame.tobytes())

    write(fp, width, height, _fps(im.info, enc), packed(), enc.get("level", 1))


def _save_all(im, fp, filename):
    _save(im, fp, filename, save_all=True)


Image.register_open(RV565ImageFile.format, RV565ImageFile, _accept)
Image.register_save(RV565ImageFile.format, _save)
Image.register_save_all(RV565ImageFile.format, _save_all)
Image.register_extension(RV565ImageFile.format, ".rv565")
Image.register_mime(RV565ImageFile.format, "video/x-rv565")

__all__ = ["RV565ImageFile"]
