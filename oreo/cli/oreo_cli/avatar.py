"""The owner's GitHub avatar for the Badge app, made on the computer.

The badge never downloads or decodes images for this: the computer
fetches the picture, turns it into a small circular RGB565 tile and
`falera setup` copies it over USB to /avatar.bin, next to /profile.json and
outside every app folder, so a FaleraOS update or a deploy never replaces
it. The file records the GitHub user it was made for, and the Badge app
shows it only while that user is the profile's GITHUB_USER
(oreoOS/profile.py `avatar()`), so a badge never shows someone else's face.

/avatar.bin (all integers unsigned bytes):

    b"OAV1"            magic (MAGIC)
    W, H               tile size in pixels (SIZE x SIZE)
    N                  length of the login
    login              N bytes, ASCII, as typed in GITHUB_USER
    pixels             W*H*2 bytes, RGB565 big-endian, row by row;
                       0xF81F (magenta) is transparent on the badge

This module needs only the standard library and Pillow (a dependency of
falera-cli, imported when a picture is converted). It imports nothing else
from the package, so tools/fetch_avatar.py in a FaleraOS checkout loads it
by path and the two never drift apart.
"""

import io
from urllib.parse import quote
from urllib.request import Request, urlopen

# Same values as AVATAR_PATH and AVATAR_MAGIC in oreoOS/profile.py (a
# contract test checks them inside a FaleraOS checkout).
PATH = "/avatar.bin"
MAGIC = b"OAV1"
SIZE = 72                       # fills the Badge app's 72 px disc; FaleraOS reads up to 72
CHROMA_KEY_RGB = (248, 0, 248)
CHROMA_KEY_565 = 0xF81F
HEADER = len(MAGIC) + 3
URL = "https://github.com/%s.png?size=%d"
USER_AGENT = "falera-cli"
TIMEOUT = 20


class AvatarError(Exception):
    """The avatar could not be fetched or converted; the text says why."""


def _open(url):
    """urlopen with a timeout; tests replace it so they never use the network."""
    return urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=TIMEOUT)


def download(user, size=SIZE):
    """The image bytes of `user`'s GitHub avatar (any format Pillow reads).

    github.com/<user>.png redirects to the avatar CDN and is not counted
    against the API's 60 requests an hour."""
    url = URL % (quote(user, safe=""), size * 2)
    try:
        with _open(url) as r:
            return r.read()
    except Exception as e:            # HTTPError, URLError, timeouts, ...
        code = getattr(e, "code", None)
        if code == 404:
            raise AvatarError("GitHub has no user %s" % user)
        reason = getattr(e, "reason", None) or e
        raise AvatarError("could not download the avatar for %s: %s" % (user, reason))


def _pillow():
    try:
        from PIL import Image
    except ImportError:
        raise AvatarError("Pillow is needed to convert the avatar (pip install Pillow)")
    return Image


def _circle(Image, size):
    """An 'L' mask with a filled circle: 255 inside, 0 in the corners."""
    mask = Image.new("L", (size, size), 0)
    r2 = (size / 2.0 - 0.5) ** 2
    c = size / 2.0 - 0.5
    px = mask.load()
    for y in range(size):
        for x in range(size):
            if (x - c) ** 2 + (y - c) ** 2 <= r2:
                px[x, y] = 255
    return mask


def _rgb565(img):
    """Big-endian RGB565 bytes of an RGB image, row by row. A pixel that
    lands on the transparent key by accident is nudged off it."""
    w, h = img.size
    raw = img.convert("RGB").tobytes()
    out = bytearray(w * h * 2)
    i = 0
    for j in range(0, len(raw), 3):
        r, g, b = raw[j], raw[j + 1], raw[j + 2]
        v = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
        if v == CHROMA_KEY_565 and (r, g, b) != CHROMA_KEY_RGB:
            v = 0xF81E
        out[i] = v >> 8
        out[i + 1] = v & 0xFF
        i += 2
    return bytes(out)


def convert(image_bytes, size=SIZE):
    """RGB565 big-endian pixels (size*size*2 bytes): the image centre-
    cropped to a square, resized, with the corners outside the circle (and
    any transparent pixels) set to the magenta key."""
    Image = _pillow()
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()
    except Exception as e:
        raise AvatarError("the avatar is not an image Pillow can read: %s" % e)
    img = img.convert("RGBA")
    w, h = img.size
    side = min(w, h)
    img = img.crop(((w - side) // 2, (h - side) // 2,
                    (w - side) // 2 + side, (h - side) // 2 + side))
    resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
    img = img.resize((size, size), resample)
    key = Image.new("RGB", (size, size), CHROMA_KEY_RGB)
    flat = key.copy()
    flat.paste(img.convert("RGB"), mask=img.split()[3])
    final = Image.composite(flat, key, _circle(Image, size))
    return _rgb565(final)


def pack(user, pixels, size=SIZE):
    """The /avatar.bin bytes for `user` (see the module docstring)."""
    login = user.encode("ascii")
    if not 0 < len(login) < 256:
        raise AvatarError("bad GitHub user for the avatar: %r" % user)
    if len(pixels) != size * size * 2:
        raise AvatarError("the avatar has %d bytes, expected %d"
                          % (len(pixels), size * size * 2))
    return MAGIC + bytes((size, size, len(login))) + login + pixels


def owner_of(head):
    """The login stored in the first bytes of an /avatar.bin, or None."""
    if len(head) < HEADER or head[:len(MAGIC)] != MAGIC:
        return None
    n = head[HEADER - 1]
    login = head[HEADER:HEADER + n]
    if len(login) != n:
        return None
    try:
        return login.decode("ascii")
    except UnicodeDecodeError:
        return None


def build(user, size=SIZE):
    """Download and convert `user`'s avatar: the /avatar.bin bytes."""
    return pack(user, convert(download(user, size), size), size)
