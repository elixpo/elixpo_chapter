"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle, Download, FileCode, Film, Loader2, Pause, Play, ShieldCheck, Upload, X,
} from "lucide-react";
import {
  buildContainer, checkSchedule, decodeFrame, parseContainer, rgb565beToRgba, rgbaToRgb565be,
  toCArray, zlibCompress, type Rv565Clip, type ScheduleReport,
} from "@/lib/rv565";

/* Video → RV565 converter. Everything runs in this tab: the video is decoded
 * by the browser's own <video> element, drawn to a canvas at the target size,
 * converted to RGB565 and compressed with CompressionStream. Nothing is
 * uploaded, so the size cap only protects the visitor's memory. */

const MAX_INPUT_MB = 200;
const MAX_SECONDS = 30;

const SIZES = [
  { id: "180x135", w: 180, h: 135, label: "180×135", note: "Paper setting: scaled to 320×240, 24 FPS with zero misses on ESP32-S3" },
  { id: "320x240", w: 320, h: 240, label: "320×240", note: "Full 2.0\" panel, no scaling" },
  { id: "240x240", w: 240, h: 240, label: "240×240", note: "1.3\" and 1.54\" square panels" },
  { id: "240x135", w: 240, h: 135, label: "240×135", note: "1.14\" panels, landscape" },
  { id: "160x120", w: 160, h: 120, label: "160×120", note: "Smallest files" },
] as const;

type Fit = "fill" | "fit";
type Result = { clip: Rv565Clip; container: Uint8Array; report: ScheduleReport; serial: ScheduleReport; name: string };

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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [playing, setPlaying] = useState(true);
  const [dragging, setDragging] = useState(false);

  const cancelRef = useRef(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const size = SIZES.find((s) => s.id === sizeId)!;
  const frameCount = Math.max(1, Math.floor(Math.min(seconds, Math.max(0, duration - start)) * fps));

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const choose = useCallback((f: File | undefined) => {
    setError(null);
    setResult(null);
    if (!f) return;
    if (!f.type.startsWith("video/")) { setError("Choose a video file (MP4, WebM or MOV)."); return; }
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

      const payloads: Uint8Array[] = [];
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
        payloads.push(await zlibCompress(rgbaToRgb565be(pixels)));
        setProgress((i + 1) / frameCount);
      }

      const container = buildContainer(size.w, size.h, fps, payloads);
      const clip = parseContainer(container);
      const name = file.name.replace(/\.[^.]+$/, "") || "clip";
      setResult({ clip, container, report: checkSchedule(clip, true), serial: checkSchedule(clip, false), name });
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [videoUrl, file, size, fit, fps, start, frameCount]);

  // Preview: inflate each frame on the fly, as the microcontroller does.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!result || !canvas || !playing) return;
    const { clip } = result;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(clip.header.width, clip.header.height);
    let frame = 0, stopped = false, timer = 0;
    const tick = async () => {
      if (stopped) return;
      const t0 = performance.now();
      rgb565beToRgba(await decodeFrame(clip, frame), image.data);
      if (stopped) return;
      ctx.putImageData(image, 0, 0);
      frame = (frame + 1) % clip.header.frames;
      timer = window.setTimeout(tick, Math.max(0, 1000 / clip.header.fps - (performance.now() - t0)));
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [result, playing]);

  const modelApplies = result && result.clip.header.width === 180 && result.clip.header.height === 135;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      {/* Input and options */}
      <div className="rounded-[1.4rem] border border-border bg-card p-6 sm:p-8">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-[1.1rem] border-2 border-dashed px-6 py-10 text-center transition-colors ${dragging ? "border-text bg-bg" : "border-border bg-bg/60 hover:border-text"}`}
        >
          <input type="file" accept="video/*" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
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
                      className={`rounded-xl border px-4 py-3 text-left transition-colors ${sizeId === s.id ? "border-text bg-bg" : "border-border hover:border-text"}`}>
                <span className="font-mono text-sm font-bold">{s.label}</span>
                <span className="mt-1 block text-xs leading-snug text-muted">{s.note}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-8 grid gap-5 sm:grid-cols-2" disabled={busy}>
          <label className="block text-sm">
            <span className="eyebrow">Frame rate</span>
            <span className="mt-2 flex items-center gap-3">
              <input type="range" min={1} max={30} value={fps} onChange={(e) => setFps(+e.target.value)} className="w-full accent-[#142018]" />
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
            {file ? `${frameCount} frames at ${size.label}` : "Choose a video to start"}
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
      <div className="rounded-[1.4rem] border border-border bg-card p-6 sm:p-8">
        <p className="eyebrow">Preview</p>
        <div className="mt-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-[#0d120f]">
          {result ? (
            <canvas ref={previewRef} width={result.clip.header.width} height={result.clip.header.height}
                    className="h-full w-full object-contain [image-rendering:pixelated]" />
          ) : (
            <p className="px-6 text-center text-xs text-white/60">The converted clip plays here, decoded from the RV565 file exactly as the board will.</p>
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

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" className="btn-primary" onClick={() => download(result.container as BlobPart, `${result.name}.rv565`, "video/x-rv565")}>
                <Download className="h-4 w-4" /> Download .rv565
              </button>
              <button type="button" className="btn-ghost" onClick={() => download(toCArray(result.clip, `${result.name}.rv565`), "clip.h", "text/x-c")}>
                <FileCode className="h-4 w-4" /> Arduino clip.h
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-border bg-bg p-4 text-sm">
              <p className="eyebrow">Will it play smoothly?</p>
              {modelApplies ? (
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
                  <li className="text-xs text-muted">From the paper&apos;s decode-cost model, on a 320×240 panel at 40 MHz SPI.</li>
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  The paper&apos;s cost model is fitted for 180×135 frames, so no prediction is shown for this size.
                  Run <code className="font-mono">rv565_check_schedule()</code> with a model measured on your board.
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
