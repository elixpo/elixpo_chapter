"""Convert photos, videos and documents into the formats FaleraOS reads.

Copied from tools/media_ingest.py and tools/encode_video_benchmark.py so
the CLI ships standalone. Keep the formats in step with those tools:

  photo     -> .rz565  "R5Z\\x01" + <HHI w,h,raw_len> + zlib(RGB565 BE)
  video     -> .rv565  RV565 v6: "RV5\\x06" + <HHBBH w,h,fps,0,frames>
                       + per frame <I len> + zlib(RGB565 BE frame)
  document  -> .mdz / .txtz  "ODZ\\x01" + <I raw_len> + zlib(UTF-8)

Videos stay on RV565 v6 even though RV565 format version 7 exists: the
Gallery, the Transfer app's checks and the firmware's _oreo_rv565 module read
only v6 until the firmware moves to the RV565 2.0 C library.

Contract (same as media_ingest): detect -> convert -> validate the final
file -> check the badge's space -> copy. Source size is never used as a
proxy for stored size.
"""

import shutil
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path

from .errors import OreoError

PHOTO_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
DOC_EXTS = {".md", ".txt"}

DEFAULT_MEDIA_BUDGET = 5 * 1024 * 1024
DEFAULT_RESERVE = 256 * 1024

GALLERY_DIR = "/apps/gallery/assets/optimized"
DOCUMENTS_DIR = "/documents"

FFMPEG_HINT = ("videos need ffmpeg on your PATH: "
               "Linux `sudo apt install ffmpeg`, macOS `brew install ffmpeg`, "
               "Windows `winget install ffmpeg`")


def safe_stem(path):
    out = "".join(c if c.isalnum() or c in "-_" else "-" for c in Path(path).stem)
    return out.strip("-")[:48] or "media"


def detect(path, forced=None):
    if forced:
        return forced
    ext = Path(path).suffix.lower()
    if ext in PHOTO_EXTS:
        return "image"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in DOC_EXTS:
        return "document"
    raise OreoError("unsupported file type: %s" % (ext or Path(path).name),
                    hint="photos: %s; videos: %s; documents: %s" % (
                        " ".join(sorted(PHOTO_EXTS)), " ".join(sorted(VIDEO_EXTS)),
                        " ".join(sorted(DOC_EXTS))))


def output_name(source, kind):
    source = Path(source)
    if kind == "video":
        suffix = ".rv565"
    elif kind == "image":
        suffix = ".rz565"
    else:
        suffix = source.suffix.lower() + "z"
    return safe_stem(source) + suffix


def destination(kind):
    return GALLERY_DIR if kind in ("image", "video") else DOCUMENTS_DIR


def have_ffmpeg():
    return shutil.which("ffmpeg") is not None


def encode_image(source, max_dim=240):
    try:
        from PIL import Image, ImageOps
    except ImportError:
        raise OreoError("Pillow is required for photos", hint="pip install Pillow")
    try:
        image = Image.open(source)
    except Exception as e:
        raise OreoError("cannot read %s as an image: %s" % (Path(source).name, e))
    with image:
        # Phone photos keep their pixels sideways and say how to turn them
        # in the EXIF Orientation tag: apply it, or portraits arrive rotated.
        image = ImageOps.exif_transpose(image).convert("RGB")
        scale = min(1.0, max_dim / float(max(image.size)))
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        if size != image.size:
            image = image.resize(size, Image.Resampling.LANCZOS)
        rgb = image.tobytes()
        raw = bytearray(image.width * image.height * 2)
        pos = 0
        for i in range(0, len(rgb), 3):
            red, green, blue = rgb[i], rgb[i + 1], rgb[i + 2]
            pixel = ((red & 0xF8) << 8) | ((green & 0xFC) << 3) | (blue >> 3)
            raw[pos] = pixel >> 8
            raw[pos + 1] = pixel & 0xFF
            pos += 2
        width, height = image.width, image.height
    return b"R5Z\x01" + struct.pack("<HHI", width, height, len(raw)) + zlib.compress(bytes(raw), 6)


def encode_document(source):
    raw = Path(source).read_bytes()
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise OreoError("documents must be UTF-8 text: %s" % exc)
    return b"ODZ\x01" + struct.pack("<I", len(raw)) + zlib.compress(raw, 9)


def _read_exact(stream, size):
    data = bytearray()
    while len(data) < size:
        chunk = stream.read(size - len(data))
        if not chunk:
            break
        data += chunk
    return bytes(data)


def encode_video(source, seconds=10.0, fps=24, width=180, height=135, start=0.0,
                 progress=None):
    """RV565 v6 through ffmpeg. progress(frames_done, frames_expected)."""
    if not have_ffmpeg():
        raise OreoError("ffmpeg was not found", hint=FFMPEG_HINT)
    if not 1 <= fps <= 30:
        raise OreoError("fps must be between 1 and 30")
    if width <= 0 or height <= 0 or width > 320 or height > 240:
        raise OreoError("video size must fit inside 320x240")
    frame_size = width * height * 2
    vf = ("fps=%d,scale=%d:%d:force_original_aspect_ratio=increase:"
          "flags=lanczos,crop=%d:%d,format=rgb565be" % (fps, width, height, width, height))
    cmd = ["ffmpeg", "-nostdin", "-nostats", "-v", "error", "-ss", str(start), "-i", str(source),
           "-t", str(seconds), "-an", "-vf", vf, "-pix_fmt", "rgb565be",
           "-f", "rawvideo", "-"]
    expected = max(1, int(seconds * fps))
    out = bytearray(b"RV5\x06" + struct.pack("<HHBBH", width, height, fps, 0, 0))
    # ffmpeg's errors go to a temporary file, not a pipe: a damaged video
    # can print more than a pipe holds (about 64 KiB) before stdout ends,
    # and ffmpeg would then block on stderr while we block on stdout.
    with tempfile.TemporaryFile() as errfile:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errfile)
        frames = 0
        try:
            while True:
                frame = _read_exact(proc.stdout, frame_size)
                if not frame:
                    break
                if len(frame) != frame_size:
                    raise OreoError("ffmpeg returned a partial frame")
                packed = zlib.compress(frame, 1)
                out += struct.pack("<I", len(packed)) + packed
                frames += 1
                if progress:
                    progress(frames, expected)
        except BaseException:
            proc.kill()
            proc.wait()
            raise
        finally:
            if proc.stdout:
                proc.stdout.close()
        rc = proc.wait()
        errfile.seek(0)
        err = errfile.read().decode("utf-8", "replace")
    if rc != 0 or frames == 0:
        raise OreoError("ffmpeg could not convert %s (rc=%d, frames=%d)"
                        % (Path(source).name, rc, frames),
                        hint=err.strip().splitlines()[-1] if err.strip() else None)
    if frames > 0xFFFF:
        raise OreoError("video has more than 65535 frames")
    struct.pack_into("<H", out, 10, frames)
    return bytes(out)


def validate(blob, kind):
    """Check a converted file before it goes anywhere. Returns its size."""
    try:
        return _validate(blob, kind)
    except zlib.error as e:
        raise OreoError("converted %s is corrupt: %s" % (kind, e))


def _validate(blob, kind):
    head = blob[:12]
    if kind == "image":
        if len(head) != 12 or head[:4] != b"R5Z\x01":
            raise OreoError("invalid compressed image")
        width, height, raw_len = struct.unpack("<HHI", head[4:12])
        if not (0 < width <= 320 and 0 < height <= 240 and raw_len == width * height * 2):
            raise OreoError("invalid compressed image dimensions")
        if len(zlib.decompress(blob[12:])) != raw_len:
            raise OreoError("compressed image payload is truncated")
    elif kind == "document":
        if len(blob) < 8 or blob[:4] != b"ODZ\x01":
            raise OreoError("invalid compressed document")
        raw_len = struct.unpack("<I", blob[4:8])[0]
        if len(zlib.decompress(blob[8:])) != raw_len:
            raise OreoError("compressed document payload is truncated")
    elif kind == "video":
        if len(head) != 12 or head[:4] != b"RV5\x06":
            raise OreoError("invalid RV565 v6 video")
        width, height, fps, _, frames = struct.unpack("<HHBBH", head[4:])
        if not (0 < width <= 320 and 0 < height <= 240 and 0 < fps <= 30 and frames > 0):
            raise OreoError("invalid RV565 v6 metadata")
        raw_len = width * height * 2
        pos = 12
        for index in range(frames):
            if pos + 4 > len(blob):
                raise OreoError("video frame %d is truncated" % index)
            packed_len = struct.unpack("<I", blob[pos:pos + 4])[0]
            pos += 4
            if len(zlib.decompress(blob[pos:pos + packed_len])) != raw_len:
                raise OreoError("video frame %d has the wrong size" % index)
            pos += packed_len
        if pos != len(blob):
            raise OreoError("video contains trailing data")
    else:
        raise OreoError("unknown media kind %r" % kind)
    return len(blob)


def check_budget(stored, media_budget=DEFAULT_MEDIA_BUDGET, reserve=DEFAULT_RESERVE):
    usable = media_budget - reserve
    if stored > usable:
        from .ui import human
        raise OreoError("the converted file needs %s; the media budget after the reserve is %s"
                        % (human(stored), human(max(0, usable))),
                        hint="shorten the video (--seconds) or shrink it (--width/--height)")


def check_space(stored, free, reserve=DEFAULT_RESERVE):
    if stored + reserve > free:
        from .ui import human
        raise OreoError("the badge has %s free; %s plus a %s reserve will not fit"
                        % (human(free), human(stored), human(reserve)),
                        hint="remove something first (`falera ls /apps/gallery/assets/optimized`, "
                             "`falera rm`)")


def convert(source, kind=None, seconds=10.0, fps=24, width=180, height=135,
            photo_max=240, progress=None):
    """Return (kind, file name on the badge, converted bytes), validated."""
    source = Path(source)
    if not source.is_file():
        raise OreoError("%s: no such file" % source)
    kind = detect(source, kind)
    if kind == "video":
        blob = encode_video(source, seconds, fps, width, height, progress=progress)
    elif kind == "image":
        blob = encode_image(source, photo_max)
    else:
        blob = encode_document(source)
    validate(blob, kind)
    return kind, output_name(source, kind), blob
