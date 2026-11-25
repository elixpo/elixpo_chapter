"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Download, FileCode, Film, Loader2, Pause, Play, ShieldCheck, Upload, X,
} from "lucide-react";
import {
  RV565_BAND_LINES, RV565_MOTION_RANGE, RV565_MAX_FPS, RV565_MAX_FPS_V6, Rv565Encoder, checkSchedule, convertPixels, decodeFrame,
  bytesSentFraction, frameTypeCounts,
  parseContainer, toCArray, toRgba, verify, type Codec, type PixelFormat, type Rv565Clip, type ScheduleReport,
} from "@/lib/rv565";

/* Video → RV565 converter. Everything runs in this tab: the video is decoded
 * by the browser's own <video> element, drawn to a canvas at the target size,
 * converted to the chosen pixel format and compressed with CompressionStream.
 * Nothing is uploaded, so the size cap only protects the visitor's memory.
 * An existing .rv565 file (version 6, 7 or 8) dropped here is checked and played
 * instead. */

const MAX_INPUT_MB = 200;
const MAX_SECONDS = 30;

const SIZES = [
  { id: "180x135", w: 180, h: 135, label: "180×135", note: "Paper setting: scaled to 320×240, 24 FPS with zero misses on ESP32-S3" },
  { id: "320x240", w: 320, h: 240, label: "320×240", note: "2.0\"–2.8\" TFTs (ST7789, ILI9341), no scaling" },
  { id: "240x240", w: 240, h: 240, label: "240×240", note: "1.3\" and 1.54\" square TFTs, GC9A01 round" },
  { id: "240x135", w: 240, h: 135, label: "240×135", note: "1.14\" TFTs, landscape" },
  { id: "160x128", w: 160, h: 128, label: "160×128", note: "1.8\" ST7735 TFTs" },
  { id: "128x128", w: 128, h: 128, label: "128×128", note: "1.44\" ST7735 TFTs, SSD1327 OLEDs" },
  { id: "256x64", w: 256, h: 64, label: "256×64", note: "SSD1322 grayscale OLEDs" },
  { id: "128x64", w: 128, h: 64, label: "128×64", note: "SSD1306 and SH1106 OLEDs, ST7567 LCDs" },
  { id: "128x32", w: 128, h: 32, label: "128×32", note: "0.91\" SSD1306 OLEDs" },
] as const;

/* Labels name the panels that take each format natively (docs/FORMAT.md). */
const FORMATS: ReadonlyArray<{ id: PixelFormat; label: string; note: string }> = [
  { id: "rgb565be", label: "RGB565 (ST7789/ILI9341 SPI)", note: "16-bit, high byte first: ST7789, ST7735, ILI9341, GC9A01 and most SPI TFTs." },
  { id: "rgb565le", label: "RGB565 little-endian (parallel/MIPI, LVGL)", note: "16-bit, low byte first: RGB parallel and MIPI panels, frame buffers in memory, LVGL without byte swap." },
  { id: "rgb444", label: "RGB444 12-bit (ST7789/ST7735 COLMOD 0x03)", note: "Two pixels in three bytes: a quarter less to send over SPI than RGB565." },
  { id: "rgb666", label: "RGB666 18-bit (ILI9488/ST7796 SPI)", note: "One byte per channel, top 6 bits used: ILI9341, ILI9488 and ST7796 in 18-bit SPI mode." },
  { id: "rgb888", label: "RGB888 24-bit (24-bit panels)", note: "Full colour, three bytes per pixel: 24-bit panels and host tools." },
  { id: "gray8", label: "Grayscale 8-bit", note: "One byte per pixel: grayscale displays and intermediate buffers." },
  { id: "gray4", label: "Grayscale 4-bit (SSD1322/SSD1327 OLED)", note: "16 levels, two pixels per byte: SSD1322, SSD1327 and SSD1362 OLEDs." },
  { id: "mono", label: "Monochrome rows (e-paper, Sharp memory LCD)", note: "1 bit per pixel in rows, 1 = lit: e-paper, Sharp memory LCDs, ST7920." },
  { id: "mono_vpage", label: "Monochrome page (SSD1306 OLED)", note: "1 bit per pixel in 8-row pages, the SSD1306, SH1106 and ST7567 RAM layout." },
];

type Fit = "fill" | "fit";
type KeyMode = "second" | "every" | "custom";
type Result = {
  clip: Rv565Clip; container: Uint8Array; report: ScheduleReport; serial: ScheduleReport; name: string;
  counts: { key: number; delta: number; repeat: number; partial: number; region: number }; opened: boolean;
  /** Share of all frame pixels sent to the display (repeats, unchanged bands
   * and the unchanged parts of region-delta bands are skipped). */
  sent: number;
};

function makeResult(clip: Rv565Clip, name: string, opened: boolean): Result {
  return {
    clip, container: clip.data, name, opened, counts: frameTypeCounts(clip), sent: bytesSentFraction(clip),
    report: checkSchedule(clip, true), serial: checkSchedule(clip, false),
  };
}

function waitFor(el: HTMLMediaElement, event: string) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("This browser cannot decode the video. Try an MP4 (H.264) or WebM file.")); };
    const cleanup = () => { el.removeEventListener(event, ok); el.removeEventListener("error", fail); };
    el.addEventListener(event, ok, { once: true });
    el.addEventListener("error", fail, { once: true });
  });
}

function formatBytes(n: number) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Rv565Converter() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [sizeId, setSizeId] = useState<(typeof SIZES)[number]["id"]>("180x135");
  const [fps, setFps] = useState(24);
  const [start, setStart] = useState(0);
  const [seconds, setSeconds] = useState(10);
  const [fit, setFit] = useState<Fit>("fill");
  const [v6, setV6] = useState(false);
  const [v7, setV7] = useState(false);
  const [pixelFormat, setPixelFormat] = useState<PixelFormat>("rgb565be");
  const [codec, setCodec] = useState<Codec>("zlib");
  const [keyMode, setKeyMode] = useState<KeyMode>("second");
  const [keyCustom, setKeyCustom] = useState(24);
  const [bandLines, setBandLines] = useState(RV565_BAND_LINES);
  const [tolerance, setTolerance] = useState(0);
  const [motionRange, setMotionRange] = useState(RV565_MOTION_RANGE);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [playing, setPlaying] = useState(true);
  const [dragging, setDragging] = useState(false);

  const cancelRef = useRef(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const size = SIZES.find((s) => s.id === sizeId)!;
  const format = FORMATS.find((f) => f.id === pixelFormat)!;
  const maxFps = v6 ? RV565_MAX_FPS_V6 : RV565_MAX_FPS;
  const frameCount = Math.max(1, Math.floor(Math.min(seconds, Math.max(0, duration - start)) * fps));
  // Version 6 is RGB565 big-endian, zlib, every frame a keyframe.
  const keyframeInterval = v6 || keyMode === "every" ? 1 : keyMode === "second" ? Math.min(255, fps) : keyCustom;

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const choose = useCallback(async (f: File | undefined) => {
    setError(null);
    setResult(null);
    if (!f) return;
    if (/\.rv565$/i.test(f.name)) {
      // Check and play an existing file: decode every frame before showing it.
      try {
        const clip = parseContainer(new Uint8Array(await f.arrayBuffer()));
        await verify(clip);
        setFile(null);
        setVideoUrl(null);
        setResult(makeResult(clip, f.name.replace(/\.rv565$/i, ""), true));
        setPlaying(true);
      } catch (e) {
        setError(`${f.name} is not a valid RV565 file: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    if (!f.type.startsWith("video/")) { setError("Choose a video file (MP4, WebM or MOV), or an .rv565 file to check."); return; }
    if (f.size > MAX_INPUT_MB * 1024 * 1024) { setError(`That file is ${formatBytes(f.size)}; the limit is ${MAX_INPUT_MB} MB. Trim it first.`); return; }
    setFile(f);
    setVideoUrl(URL.createObjectURL(f));
    setStart(0);
  }, []);

  const convert = useCallback(async () => {
    if (!videoUrl || !file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    cancelRef.current = false;
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = videoUrl;
      await waitFor(video, "loadeddata");

      const canvas = document.createElement("canvas");
      canvas.width = size.w;
      canvas.height = size.h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.imageSmoothingQuality = "high";

      const vw = video.videoWidth, vh = video.videoHeight;
      const scale = fit === "fill" ? Math.max(size.w / vw, size.h / vh) : Math.min(size.w / vw, size.h / vh);
      const dw = vw * scale, dh = vh * scale;
      const dx = (size.w - dw) / 2, dy = (size.h - dh) / 2;

      const encoder = new Rv565Encoder(size.w, size.h, fps, {
        version: v6 ? 6 : v7 ? 7 : undefined, pixelFormat: v6 ? "rgb565be" : pixelFormat, codec: v6 ? "zlib" : codec, keyframeInterval,
        bandLines: v6 ? 0 : bandLines, tolerance, motionRange,
      });
      for (let i = 0; i < frameCount; i++) {
        if (cancelRef.current) throw new Error("Cancelled.");
        const t = start + i / fps;
        if (Math.abs(video.currentTime - t) > 1e-4) {
          const seeked = waitFor(video, "seeked");
          video.currentTime = t;
          await seeked;
        }
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, size.w, size.h);
        ctx.drawImage(video, dx, dy, dw, dh);
        const pixels = ctx.getImageData(0, 0, size.w, size.h).data;
        await encoder.add(convertPixels(pixels, size.w, size.h, encoder.pixelFormat, 4));
        setProgress((i + 1) / frameCount);
        // The shift search is synchronous: give the page a turn between frames.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const clip = parseContainer(encoder.finish());
      const name = file.name.replace(/\.[^.]+$/, "") || "clip";
      setResult(makeResult(clip, name, false));
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [videoUrl, file, size, fit, fps, start, frameCount, v6, v7, pixelFormat, codec, keyframeInterval, bandLines, tolerance, motionRange]);

  // Preview: decode each frame on the fly, as the microcontroller does, then
  // show it as RGB (grayscale and monochrome formats as white on black).
  useEffect(() => {
    const canvas = previewRef.current;
    if (!result || !canvas || !playing) return;
    const { clip } = result;
    const { width, height, pixelFormat: fmt } = clip.header;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(clip.header.width, clip.header.height);
    let frame = 0, stopped = false, timer = 0;
    const tick = async () => {
      if (stopped) return;
      const t0 = performance.now();
      toRgba(await decodeFrame(clip, frame), width, height, fmt, image.data);
      if (stopped) return;
      ctx.putImageData(image, 0, 0);
      frame = (frame + 1) % clip.header.frames;
      timer = window.setTimeout(tick, Math.max(0, 1000 / clip.header.fps - (performance.now() - t0)));
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [result, playing]);

  const header = result?.clip.header;
  const rgb565zlib = header?.pixelFormat === "rgb565be" && header.codec === "zlib";
  const modelApplies = rgb565zlib && header.width === 180 && header.height === 135;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      {/* Input and options */}
      <div className="rounded-card border border-border bg-card p-6 sm:p-8">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-inner border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-text bg-bg" : "border-border bg-bg/60 hover:border-text"}`}
        >
          <input type="file" accept="video/*,.rv565" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
          {file ? (
            <>
              <Film className="h-7 w-7" />
              <span className="mt-3 max-w-full truncate font-semibold">{file.name}</span>
              <span className="mt-1 text-xs text-muted">
                {formatBytes(file.size)}{duration ? ` · ${duration.toFixed(1)} s` : ""} · click to change
              </span>
            </>
          ) : (
            <>
              <Upload className="h-7 w-7" />
              <span className="mt-3 font-semibold">Drop a video here, or click to choose</span>
              <span className="mt-1 text-xs text-muted">MP4, WebM or MOV · up to {MAX_INPUT_MB} MB · stays on your device</span>
              <span className="mt-1 text-xs text-muted">Or drop an .rv565 file (version 6, 7 or 8) to check and play it</span>
            </>
          )}
        </label>
        {videoUrl && (
          <video src={videoUrl} muted playsInline className="hidden"
                 onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)} />
        )}

        <fieldset className="mt-8" disabled={busy}>
          <legend className="eyebrow mb-3">Frame size</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SIZES.map((s) => (
              <button key={s.id} type="button" onClick={() => setSizeId(s.id)}
                      className={`rounded-inner border px-4 py-3 text-left transition-colors ${sizeId === s.id ? "border-text bg-bg" : "border-border hover:border-text"}`}>
                <span className="font-mono text-sm font-bold">{s.label}</span>
                <span className="mt-1 block text-xs leading-snug text-muted">{s.note}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-8 grid gap-5 sm:grid-cols-2" disabled={busy}>
          <legend className="eyebrow mb-3">Display and file format</legend>
          <label className="block text-sm sm:col-span-2">
            <span className="eyebrow">Pixel format</span>
            <select value={v6 ? "rgb565be" : pixelFormat} disabled={v6} onChange={(e) => setPixelFormat(e.target.value as PixelFormat)}
                    className="mt-2 w-full rounded-pill border border-border bg-bg px-4 py-2">
              {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <span className="mt-2 block text-xs leading-snug text-muted">
              {v6 ? FORMATS[0].note : format.note} The page converts the colours, so the board only decodes and sends.
            </span>
          </label>
          <label className="block text-sm">
            <span className="eyebrow">Compression</span>
            <select value={v6 ? "zlib" : codec} disabled={v6} onChange={(e) => setCodec(e.target.value as Codec)}
                    className="mt-2 w-full rounded-pill border border-border bg-bg px-4 py-2">
              <option value="zlib">zlib (smaller files)</option>
              <option value="stored">Stored (no inflate on the board)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="eyebrow">Keyframes</span>
            <select value={v6 ? "every" : keyMode} disabled={v6} onChange={(e) => setKeyMode(e.target.value as KeyMode)}
                    className="mt-2 w-full rounded-pill border border-border bg-bg px-4 py-2">
              <option value="second">Every second ({Math.min(255, fps)} frames)</option>
              <option value="every">Every frame</option>
              <option value="custom">Every N frames…</option>
            </select>
            {keyMode === "custom" && !v6 && (
              <input type="number" min={1} max={255} value={keyCustom} aria-label="Keyframe interval in frames"
                     onChange={(e) => setKeyCustom(Math.min(255, Math.max(1, Math.round(+e.target.value) || 1)))}
                     className="mt-2 w-full rounded-pill border border-border bg-bg px-4 py-2" />
            )}
          </label>
          <p className="text-xs leading-relaxed text-muted sm:col-span-2">
            Between keyframes, a frame identical to the one before is stored as a repeat. Any other frame is stored as
            whichever is smallest of a keyframe, an XOR delta, a partial delta, which carries only the bands of rows
            that changed, each predicted from the previous frame, shifted to follow motion, and a region delta, which
            narrows each changed band to the columns that changed. Region and partial deltas win even when slightly
            larger, because the board then sends only those parts to the display. A keyframe every second keeps seeking
            to at most one second of frames.
          </p>
          <label className="block text-sm sm:col-span-2">
            <span className="eyebrow">Tolerance</span>
            <span className="mt-2 flex items-center gap-3">
              <input type="range" min={0} max={64} value={tolerance} onChange={(e) => setTolerance(+e.target.value)}
                     aria-label="Tolerance, per colour channel out of 255" className="w-full accent-[#142018]" />
              <span className="w-20 text-right font-mono">{tolerance ? `±${tolerance}` : "exact"}</span>
            </span>
            <span className="mt-2 block text-xs leading-snug text-muted">
              0 keeps every frame exact. A higher value lets a pixel keep its colour from the previous frame when the new
              colour is within that many steps (out of 255) on every channel, so noise and slow fades stop counting as
              changes: files get smaller and more frames become repeats or small partial updates. No pixel is ever further
              than this from the converted video.
            </span>
          </label>
          <details className="text-sm sm:col-span-2">
            <summary className="eyebrow cursor-pointer">Advanced</summary>
            <label className="mt-3 block">
              <span className="eyebrow">Partial-delta band height (rows)</span>
              <input type="number" min={0} max={255} value={v6 ? 0 : bandLines} disabled={v6} aria-label="Band height in rows"
                     onChange={(e) => setBandLines(Math.min(255, Math.max(0, Math.round(+e.target.value) || 0)))}
                     className="mt-2 w-full rounded-pill border border-border bg-bg px-4 py-2" />
              <span className="mt-2 block text-xs leading-snug text-muted">
                Partial deltas mark changes in bands of this many rows (pages of 8 rows for SSD1306-style monochrome). Smaller
                bands send less to the display but add a few bytes of mask. Default {RV565_BAND_LINES}; 0 turns partial and region deltas off.
              </span>
            </label>
            <label className="mt-4 block">
              <span className="eyebrow">Motion search (pixels)</span>
              <input type="number" min={0} max={64} value={v6 ? 0 : motionRange} disabled={v6} aria-label="Motion search range in pixels"
                     onChange={(e) => setMotionRange(Math.min(64, Math.max(0, Math.round(+e.target.value) || 0)))}
                     className="mt-2 w-full rounded-pill border border-border bg-bg px-4 py-2" />
              <span className="mt-2 block text-xs leading-snug text-muted">
                Each changed band may be predicted from the previous frame shifted by up to this many pixels sideways and
                up to a band height up or down, so scrolling text, lists and pans cost little. Larger ranges search longer
                while converting; the board&apos;s decoding cost does not change. Default {RV565_MOTION_RANGE}; 0 turns the search off.
              </span>
            </label>
          </details>
          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <input type="checkbox" checked={v6 || v7} disabled={v6} className="mt-1 accent-[#142018]"
                   onChange={(e) => setV7(e.target.checked)} />
            <span>
              <span className="font-semibold">Compatible with version 7 players</span>
              <span className="block text-xs leading-snug text-muted">
                Leaves out region deltas, so RV565 2.x players read the file. Without it the file is version 8 when region
                deltas make it smaller or send less to the display, and version 7 otherwise.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <input type="checkbox" checked={v6} className="mt-1 accent-[#142018]"
                   onChange={(e) => { setV6(e.target.checked); if (e.target.checked) setFps((f) => Math.min(f, RV565_MAX_FPS_V6)); }} />
            <span>
              <span className="font-semibold">Version 6 file</span>
              <span className="block text-xs leading-snug text-muted">
                For players that read only version 6: the released RV565 1.x library and the Falera badge Gallery.
                RGB565, zlib, every frame a keyframe, up to 30 FPS.
              </span>
            </span>
          </label>
        </fieldset>

        <fieldset className="mt-8 grid gap-5 sm:grid-cols-2" disabled={busy}>
          <label className="block text-sm">
            <span className="eyebrow">Frame rate</span>
            <span className="mt-2 flex items-center gap-3">
              <input type="range" min={1} max={maxFps} value={Math.min(fps, maxFps)} onChange={(e) => setFps(+e.target.value)} className="w-full accent-[#142018]" />
              <span className="w-14 text-right font-mono">{fps} FPS</span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="eyebrow">Fit</span>
            <select value={fit} onChange={(e) => setFit(e.target.value as Fit)}
                    className="mt-2 w-full rounded-pill border border-border bg-bg px-4 py-2">
              <option value="fill">Fill (crop edges)</option>
              <option value="fit">Fit (black bars)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="eyebrow">Start at (s)</span>
            <input type="number" min={0} step={0.1} max={Math.max(0, duration - 0.1)} value={start}
                   onChange={(e) => setStart(Math.max(0, +e.target.value))}
                   className="mt-2 w-full rounded-pill border border-border bg-bg px-4 py-2" />
          </label>
          <label className="block text-sm">
            <span className="eyebrow">Length (s, max {MAX_SECONDS})</span>
            <input type="number" min={0.1} step={0.1} max={MAX_SECONDS} value={seconds}
                   onChange={(e) => setSeconds(Math.min(MAX_SECONDS, Math.max(0.1, +e.target.value)))}
                   className="mt-2 w-full rounded-pill border border-border bg-bg px-4 py-2" />
          </label>
        </fieldset>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {busy ? (
            <button type="button" className="btn-ghost" onClick={() => { cancelRef.current = true; }}>
              <X className="h-4 w-4" /> Cancel
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={!file} onClick={convert}>
              Convert to RV565
            </button>
          )}
          <span className="text-xs text-muted">
            {file ? `${frameCount} frames at ${size.label}, ${v6 ? "version 6" : `${pixelFormat}, ${codec}`}` : "Choose a video to start"}
          </span>
        </div>

        {busy && (
          <div className="mt-5" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-pill bg-bg">
              <div className="h-full bg-text transition-[width]" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-2 flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> Encoding frame {Math.round(progress * frameCount)} of {frameCount}
            </p>
          </div>
        )}
        {error && (
          <p className="mt-5 flex items-start gap-2 text-sm text-primary" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
      </div>

      {/* Result */}
      <div className="rounded-card border border-border bg-card p-6 sm:p-8">
        <p className="eyebrow">Preview</p>
        <div className="mt-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-inner bg-[#0d120f]">
          {result ? (
            <canvas ref={previewRef} width={result.clip.header.width} height={result.clip.header.height}
                    className="h-full w-full object-contain [image-rendering:pixelated]" />
          ) : (
            <p className="px-6 text-center text-xs text-white/60">The converted clip plays here, decoded from the RV565 file exactly as the board will, shown in RGB.</p>
          )}
        </div>

        {result ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="btn-ghost !min-h-[36px] !px-4 !py-1.5" onClick={() => setPlaying((p) => !p)}>
                {playing ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Play</>}
              </button>
              <span className="font-mono text-xs text-muted">
                {result.clip.header.width}×{result.clip.header.height} · {result.clip.header.fps} FPS · {result.clip.header.frames} frames · {formatBytes(result.container.length)}
              </span>
            </div>
            <p className="mt-2 font-mono text-xs text-muted">
              RV565 v{result.clip.header.version} · {result.clip.header.pixelFormat} · {result.clip.header.codec}
              {" "}· keyframe every {result.clip.header.keyframeInterval} · {result.counts.key} key, {result.counts.delta} delta, {result.counts.partial} partial, {result.counts.region} region, {result.counts.repeat} repeat
              {" "}· {(result.sent * 100).toFixed(1)}% of pixels sent to the display
              {result.opened ? " · every frame verified" : ""}
            </p>
            {result.clip.header.version === 8 && (
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Version 8 files use region deltas and need an RV565 3.0 player. For RV565 2.x players, tick
                &ldquo;Compatible with version 7 players&rdquo;.
              </p>
            )}
            {result.clip.header.version === 7 && (
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Version 7 files need an RV565 2.0 player. The released RV565 1.x library and the Falera badge Gallery read
                version 6: tick &ldquo;Version 6 file&rdquo; for them.
              </p>
            )}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" className="btn-primary" onClick={() => download(result.container as BlobPart, `${result.name}.rv565`, "video/x-rv565")}>
                <Download className="h-4 w-4" /> Download .rv565
              </button>
              <button type="button" className="btn-ghost" onClick={() => download(toCArray(result.clip, `${result.name}.rv565`), "clip.h", "text/x-c")}>
                <FileCode className="h-4 w-4" /> Arduino clip.h
              </button>
            </div>

            <div className="mt-6 rounded-inner border border-border bg-bg p-4 text-sm">
              <p className="eyebrow">Will it play smoothly?</p>
              {modelApplies && header ? (
                <ul className="mt-2 space-y-1">
                  <li>
                    <span className="font-semibold">ESP32-S3, dual-core: </span>
                    <span className={result.report.lateFrames ? "text-primary" : "text-teal"}>
                      {result.report.lateFrames ? `${result.report.lateFrames} late frames predicted` : "yes, no missed frames predicted"}
                    </span>
                  </li>
                  <li>
                    <span className="font-semibold">ESP32-S3, single core: </span>
                    <span className={result.serial.lateFrames ? "text-primary" : "text-teal"}>
                      {result.serial.lateFrames ? `${result.serial.lateFrames} of ${result.clip.header.frames} frames late` : "yes"}
                    </span>
                  </li>
                  <li className="text-xs text-muted">
                    From the paper&apos;s decode-cost model, on a 320×240 panel at 40 MHz SPI.
                    {result.counts.delta || result.counts.partial ? " Deltas and partial deltas add an XOR pass, which the model does not include; partial deltas also send less than a full frame, which it does not credit." : ""}
                  </li>
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {rgb565zlib
                    ? "The paper's cost model is fitted for 180×135 frames, so no prediction is shown for this size."
                    : "The paper's cost model is fitted for RGB565 zlib frames, so no prediction is shown for this format."}
                  {" "}Measure decode time on your board and fit its own model before relying on a frame rate.
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Your video never leaves this device. Conversion runs in your browser; there is no upload and no account.
          </p>
        )}
      </div>
    </div>
  );
}
