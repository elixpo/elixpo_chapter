"""The owner's avatar (#133): converted on the computer, copied to
/avatar.bin by `falera setup`, and read back with the real oreoOS/profile.py
inside a FaleraOS checkout. No test reaches the network: fake.py replaces
avatar._open, and the tests here put a local picture in its place."""

import ast
import importlib.util
import io
import json
import sys
import tempfile
import types
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

from helpers import run_cli

from fake import FakeTransport
from oreo_cli import avatar

REPO = Path(__file__).resolve().parents[2]
PROFILE = REPO / "oreoOS" / "profile.py"
STATE = REPO / "oreoOS" / "state.py"
FETCH_TOOL = REPO / "tools" / "fetch_avatar.py"

try:
    from PIL import Image
except ImportError:      # pragma: no cover - Pillow is a CLI dependency
    Image = None


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def picture(color=(0, 200, 0), size=(120, 90)):
    """PNG bytes: a solid rectangle (not square, so the crop is exercised)."""
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


class _Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@contextmanager
def github(images):
    """avatar._open serving `images` (login -> bytes); records the URLs."""
    urls = []

    def fake_open(url):
        urls.append(url)
        login = url.split("github.com/", 1)[1].split(".png", 1)[0]
        if login not in images:
            err = OSError("HTTP Error 404: Not Found")
            err.code = 404
            raise err
        return _Response(images[login])
    with mock.patch.object(avatar, "_open", fake_open):
        yield urls


def pixel(data, x, y, size=avatar.SIZE):
    i = (y * size + x) * 2
    return data[i] << 8 | data[i + 1]


@unittest.skipIf(Image is None, "Pillow is not installed")
class ConvertTest(unittest.TestCase):
    def test_circle_tile_in_rgb565_big_endian(self):
        data = avatar.convert(picture((0, 200, 0)))
        self.assertEqual(len(data), avatar.SIZE * avatar.SIZE * 2)
        c = avatar.SIZE // 2
        green = ((200 & 0xFC) << 3)
        self.assertEqual(pixel(data, c, c), green)
        for x, y in ((0, 0), (avatar.SIZE - 1, 0), (0, avatar.SIZE - 1),
                     (avatar.SIZE - 1, avatar.SIZE - 1)):
            self.assertEqual(pixel(data, x, y), avatar.CHROMA_KEY_565, (x, y))
        self.assertEqual(pixel(data, c, 1), green)          # the circle fills the tile

    def test_transparent_pixels_become_the_key_and_magenta_photos_do_not(self):
        buf = io.BytesIO()
        Image.new("RGBA", (64, 64), (10, 20, 30, 0)).save(buf, "PNG")
        data = avatar.convert(buf.getvalue())
        c = avatar.SIZE // 2
        self.assertEqual(pixel(data, c, c), avatar.CHROMA_KEY_565)
        data = avatar.convert(picture((250, 2, 250)))      # almost the key colour
        self.assertNotEqual(pixel(data, c, c), avatar.CHROMA_KEY_565)

    def test_not_an_image(self):
        with self.assertRaises(avatar.AvatarError):
            avatar.convert(b"<html>rate limited</html>")

    def test_pack_and_owner_of(self):
        data = avatar.pack("Octo-Cat", bytes(avatar.SIZE * avatar.SIZE * 2))
        self.assertEqual(data[:4], b"OAV1")
        self.assertEqual(avatar.owner_of(data), "Octo-Cat")
        self.assertIsNone(avatar.owner_of(b"OAV1"))
        self.assertIsNone(avatar.owner_of(b"PNG\x00" + data[4:]))
        with self.assertRaises(avatar.AvatarError):
            avatar.pack("octocat", b"short")

    def test_download_errors_are_avatar_errors(self):
        with github({}) as urls:
            with self.assertRaises(avatar.AvatarError) as cm:
                avatar.download("nobody-here")
        self.assertIn("no user nobody-here", str(cm.exception))
        self.assertEqual(urls, ["https://github.com/nobody-here.png?size=%d" % (2 * avatar.SIZE)])
        with self.assertRaises(avatar.AvatarError):     # fake.py: offline
            avatar.download("octocat")


@unittest.skipUnless(PROFILE.exists(), "not inside a FaleraOS checkout")
class BadgeContractTest(unittest.TestCase):
    """The file the CLI writes is the file oreoOS/profile.py reads."""

    def test_path_and_magic_match(self):
        found = {}
        for node in ast.parse(PROFILE.read_text()).body:
            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
                if node.targets[0].id in ("AVATAR_PATH", "AVATAR_MAGIC"):
                    found[node.targets[0].id] = ast.literal_eval(node.value)
        self.assertEqual(found, {"AVATAR_PATH": avatar.PATH, "AVATAR_MAGIC": avatar.MAGIC})

    def badge_profile(self, path):
        state = load(STATE, "oreo_state_for_avatar_test")
        pkg = types.ModuleType("oreoOS")
        pkg.state = state
        saved = {k: sys.modules.get(k) for k in ("oreoOS", "oreoOS.state")}
        sys.modules.update({"oreoOS": pkg, "oreoOS.state": state})
        try:
            profile = load(PROFILE, "oreo_profile_for_avatar_test")
        finally:
            for k, v in saved.items():
                if v is None:
                    sys.modules.pop(k, None)
                else:
                    sys.modules[k] = v
        profile.AVATAR_PATH = str(path)
        return profile

    @unittest.skipIf(Image is None, "Pillow is not installed")
    def test_badge_reads_what_the_cli_packs(self):
        pixels = avatar.convert(picture())
        path = Path(tempfile.mkdtemp()) / "avatar.bin"
        path.write_bytes(avatar.pack("octocat", pixels))
        profile = self.badge_profile(path)
        got = profile.avatar("OctoCat")
        self.assertIsNotNone(got)
        buf, w, h = got
        self.assertIsInstance(buf, bytearray)
        self.assertEqual((w, h), (avatar.SIZE, avatar.SIZE))
        self.assertEqual(bytes(buf), pixels)
        self.assertIsNone(profile.avatar("someone-else"))
        self.assertIsNone(profile.avatar(""))
        self.assertIsNone(profile.avatar("octocat", max_side=40))


@unittest.skipIf(Image is None, "Pillow is not installed")
class SetupAvatarTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeTransport()
        self.addCleanup(self.fake.cleanup)
        self.images = {"octocat": picture((0, 200, 0)), "hubot": picture((200, 0, 0))}

    def owner(self):
        if not self.fake.exists(avatar.PATH):
            return None
        return avatar.owner_of(self.fake.get(avatar.PATH))

    def setup(self, *argv):
        with github(self.images) as urls:
            r = run_cli(["setup"] + list(argv), fake=self.fake)
        return r, urls

    def test_setting_the_user_fetches_their_avatar(self):
        r, urls = self.setup("--github-user", "octocat")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(len(urls), 1)
        self.assertEqual(self.owner(), "octocat")
        data = self.fake.get(avatar.PATH)
        self.assertEqual(len(data), avatar.HEADER + len("octocat") + avatar.SIZE ** 2 * 2)
        self.assertIn("saved /avatar.bin", r.out)
        self.assertFalse(self.fake.exists(avatar.PATH + ".part"))

    def test_same_user_is_not_fetched_again_unless_asked(self):
        self.setup("--github-user", "octocat")
        r, urls = self.setup("--name", "Mona")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(urls, [])
        self.assertIn("falera setup --avatar", r.out)
        r, urls = self.setup("--avatar")             # alone: no profile prompt
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(len(urls), 1)
        self.assertEqual(self.owner(), "octocat")
        self.assertEqual(json.loads(self.fake.get("/profile.json")),
                         {"GITHUB_USER": "octocat", "DISPLAY_NAME": "Mona"})

    def test_new_user_replaces_the_avatar(self):
        self.setup("--github-user", "octocat")
        r, urls = self.setup("--github-user", "hubot")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.owner(), "hubot")

    def test_failed_fetch_never_leaves_another_users_face(self):
        self.setup("--github-user", "octocat")
        r, urls = self.setup("--github-user", "nobody-here")
        self.assertEqual(r.rc, 0, r.out)            # the profile is still saved
        self.assertIn("no avatar", r.out)
        self.assertIn("initials", r.out)
        self.assertFalse(self.fake.exists(avatar.PATH))
        self.assertEqual(json.loads(self.fake.get("/profile.json"))["GITHUB_USER"],
                         "nobody-here")

    def test_offline_keeps_the_owners_own_avatar(self):
        self.setup("--github-user", "octocat")
        r = run_cli(["setup", "--avatar"], fake=self.fake)     # fake.py: no network
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("no avatar", r.out)
        self.assertEqual(self.owner(), "octocat")

    def test_removing_the_user_removes_the_avatar(self):
        self.setup("--github-user", "octocat")
        r, urls = self.setup("--github-user", "")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(urls, [])
        self.assertFalse(self.fake.exists(avatar.PATH))

    def test_no_avatar_skips_it(self):
        r, urls = self.setup("--github-user", "octocat", "--no-avatar")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(urls, [])
        self.assertFalse(self.fake.exists(avatar.PATH))

    def test_show_names_the_avatar_and_writes_nothing(self):
        self.setup("--github-user", "octocat")
        r, urls = self.setup("--show")
        self.assertEqual(r.rc, 0, r.out)
        self.assertIn("avatar of @octocat", r.out)
        self.assertEqual(urls, [])

    def test_avatar_without_a_user(self):
        r, urls = self.setup("--avatar")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(urls, [])
        self.assertFalse(self.fake.exists(avatar.PATH))

    def test_flag_conflicts_fail_before_the_badge(self):
        for argv in (["--avatar", "--no-avatar"], ["--show", "--avatar"]):
            r = run_cli(["setup"] + argv)
            self.assertEqual(r.rc, 2, (argv, r.out))
            self.assertEqual(r.links, [])

    def test_avatar_from_secrets_py_user(self):
        sec = types.ModuleType("secrets")
        sec.GITHUB_USER = "hubot"
        self.fake.modules = {"secrets": sec}
        r, urls = self.setup("--avatar")
        self.assertEqual(r.rc, 0, r.out)
        self.assertEqual(self.owner(), "hubot")


@unittest.skipUnless(FETCH_TOOL.exists(), "not inside a FaleraOS checkout")
@unittest.skipIf(Image is None, "Pillow is not installed")
class FetchToolTest(unittest.TestCase):
    """tools/fetch_avatar.py shares this module instead of copying it."""

    def test_tool_writes_the_same_file(self):
        tool = load(FETCH_TOOL, "oreo_fetch_avatar_tool")
        d = Path(tempfile.mkdtemp())
        src = d / "me.png"
        src.write_bytes(picture())
        out = d / "avatar.bin"
        with mock.patch("sys.stdout", io.StringIO()):
            rc = tool.main(["--user", "@octocat", "--from-image", str(src), "--out", str(out)])
        self.assertEqual(rc, 0)
        self.assertEqual(out.read_bytes(), avatar.pack("octocat", avatar.convert(picture())))


if __name__ == "__main__":
    unittest.main()
