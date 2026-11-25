# File-type registration

Files that teach other software to recognise `.rv565` files. Each is also
being proposed upstream; the status is tracked in `docs/ROADMAP.md`.

| Directory | What | Use it locally |
| --- | --- | --- |
| `file/` | `file(1)` / libmagic signature, and the upstream patch | `file -m contrib/file/rv565.magic clip.rv565` |
| `freedesktop/` | shared-mime-info type `video/x-rv565` for Linux desktops | see the comment at the top of `rv565.xml` |
| `pronom/` | Fields for a PRONOM (UK National Archives) format record | — |
| `kaitai/` | [Kaitai Struct](https://kaitai.io) description, for parsers in many languages and the Web IDE's hex view | open `kaitai/rv565.ksy` in https://ide.kaitai.io with a clip |
| `ffmpeg/` | FFmpeg decoder, encoder, demuxer and muxer (two patches, built and FATE-tested) | build steps in `ffmpeg/README.md` |

All of them recognise format versions 6 and 7. The `file(1)` and PRONOM
signatures check `RV5`, the version byte and the frame rate (1–30 in version
6, 1–60 in version 7), then the zlib header byte `0x78` of the first frame
in version 6, or the version 7 header fields and a keyframe as the first
frame; shared-mime-info matches `RV5` and the version byte.
