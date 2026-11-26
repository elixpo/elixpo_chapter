# Add your photo to the Gallery

Put a photo (or a short video) on the badge and flip to it in the
**Gallery** app. There are three ways; the first needs nothing but the
`falera` command.

- **Difficulty:** beginner, about 8 minutes
- **You need:** a badge, a USB-C cable and [falera-cli](../CLI.md#install);
  `ffmpeg` on your computer for videos

## What the Gallery shows

The badge cannot decode JPEG or MP4 itself, so every file is converted on
your computer into a format the badge draws directly:

| You send | It is stored as | Size on the badge |
|---|---|---|
| A photo (`.jpg`, `.png`, ...) | `.rz565`: RGB565 pixels, zlib-compressed | longest side 240 px by default (`--photo-max`) |
| A video (`.mp4`, `.mov`, ...) | `.rv565`: RV565 video, independent compressed frames | 180x135 at 24 fps, first 10 seconds by default |
| A photo baked into FaleraOS | a `.py` module in `apps/gallery/assets/optimized/` | fitted into 320x196 |

All of them live in `/apps/gallery/assets/optimized/` on the badge.

## Way 1: the Transfer app (easiest)

FaleraOS keeps running, and the person holding the badge approves the
transfer with a code.

1. On the badge, open the apps drawer, go to **Tools** and open
   **Transfer**. It shows a six-character code.
2. On your computer:

   ```bash
   falera transfer send me.jpg
   ```

3. Type the code from the badge when asked.

The file is converted, sent, checked (SHA-256) and saved, and the badge
shows a notification. Press **HOME**, open **Gallery** and use
**LEFT / RIGHT** to reach it. Videos play with **A**; **UP / DOWN** seek.

More in [TRANSFER.md](../TRANSFER.md).

## Way 2: `falera add` (no app, no code)

When the badge is yours and nobody else needs to approve:

```bash
falera add me.jpg
falera add clip.mp4 --seconds 8
```

This pauses FaleraOS, copies the converted file over the USB console and
restarts FaleraOS. Same formats, same folder. Use `--save DIR` to keep the
converted files on your computer too.

## Way 3: bake it into your build

If you build FaleraOS from a checkout and want the photo on every badge you
deploy:

```bash
cp me.png apps/gallery/assets/raw/
python3 tools/optimize_assets.py --app gallery      # raw/ -> optimized/me.py
./deploy --board
```

`tools/deploy.py` pushes a Gallery photo module only while its source image
is still in `apps/gallery/assets/raw/`, and removes modules from the badge
whose source you deleted. Keep personal photos out of commits.

## Removing a photo

```bash
falera transfer list              # what is on the badge, and free space
falera transfer rm me.rz565       # asks first
```

In the Gallery app, **B** deletes the uploaded file being shown, straight
away and without asking. Photos
baked into the build (Way 3) are not deleted there, because the next deploy
would push them back.

## Limits

- One file can be up to 8 MiB over Transfer; `falera add` checks a 5 MiB
  media budget. The badge keeps 256 KiB free for FaleraOS.
- A file with the same name replaces the old one.
- Only one program can use the USB port at a time: close `falera logs`,
  `mpremote` or a serial monitor first.

## See also

- [CLI.md: falera transfer](../CLI.md#falera-transfer-send-files-to-the-transfer-app)
  and [falera add](../CLI.md#falera-add-photos-videos-and-documents-without-the-transfer-app)
- [MEDIA_INGESTION.md](../MEDIA_INGESTION.md): how files are converted and
  checked
