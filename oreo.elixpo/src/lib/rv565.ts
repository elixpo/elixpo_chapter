/* RV565 container (version 6) in the browser: encode, parse, decode.
 *
 * Mirrors the reference tools in github.com/elixpo/rv565 (python/src/rv565):
 * a 12-byte little-endian header ("RV5", version, width, height, fps, flags,
 * frame count), then per frame a u32 length and a zlib payload that inflates
 * to exactly 2·w·h bytes of big-endian RGB565.
 *
 * zlib framing comes from CompressionStream("deflate"), which is RFC 1950
 * zlib despite the name, so no compression library ships with the page.
 */

export const RV565_VERSION = 6;
export const RV565_HEADER_SIZE = 12;
export const RV565_MAX_FPS = 30;
export const RV565_MAX_FRAMES = 0xffff;

export type Rv565Header = {
  width: number;
  height: number;
  fps: number;
  flags: number;
  frames: number;
};

export type Rv565Clip = {
  header: Rv565Header;
  data: Uint8Array;
  /** [offset, length] of each frame's payload. */
  index: Array<[number, number]>;
};

export class Rv565Error extends Error {}

/** RGBA pixels (canvas ImageData) to big-endian RGB565. */
export function rgbaToRgb565be(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array((rgba.length / 4) * 2);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 2) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    out[o] = (r & 0xf8) | (g >> 5);
    out[o + 1] = ((g & 0x1c) << 3) | (b >> 3);
  }
  return out;
}

/** Big-endian RGB565 to RGBA pixels, for previews. */
export function rgb565beToRgba(src: Uint8Array, out?: Uint8ClampedArray): Uint8ClampedArray {
  const rgba = out ?? new Uint8ClampedArray((src.length / 2) * 4);
  for (let i = 0, o = 0; i < src.length; i += 2, o += 4) {
    const v = (src[i] << 8) | src[i + 1];
    const r = v >> 11, g = (v >> 5) & 0x3f, b = v & 0x1f;
    rgba[o] = (r * 527 + 23) >> 6;
    rgba[o + 1] = (g * 259 + 33) >> 6;
    rgba[o + 2] = (b * 527 + 23) >> 6;
    rgba[o + 3] = 255;
  }
  return rgba;
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const piped = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

export const zlibCompress = (data: Uint8Array) => pipe(data, new CompressionStream("deflate"));
export const zlibInflate = (data: Uint8Array) => pipe(data, new DecompressionStream("deflate"));

/** Assemble a container from already-compressed frame payloads. */
export function buildContainer(width: number, height: number, fps: number, payloads: Uint8Array[]): Uint8Array {
  if (!(width > 0 && width <= 0xffff && height > 0 && height <= 0xffff)) throw new Rv565Error("size out of range");
  if (!(fps >= 1 && fps <= RV565_MAX_FPS)) throw new Rv565Error("fps must be 1-30");
  if (payloads.length < 1 || payloads.length > RV565_MAX_FRAMES) throw new Rv565Error("frame count out of range");
  const total = RV565_HEADER_SIZE + payloads.reduce((n, p) => n + 4 + p.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([0x52, 0x56, 0x35, RV565_VERSION], 0);
  view.setUint16(4, width, true);
  view.setUint16(6, height, true);
  out[8] = fps;
  out[9] = 0;
  view.setUint16(10, payloads.length, true);
  let offset = RV565_HEADER_SIZE;
  for (const p of payloads) {
    view.setUint32(offset, p.length, true);
    out.set(p, offset + 4);
    offset += 4 + p.length;
  }
  return out;
}

/** Validate a whole container and index its frames. */
export function parseContainer(data: Uint8Array): Rv565Clip {
  if (data.length < RV565_HEADER_SIZE) throw new Rv565Error("file too short");
  if (data[0] !== 0x52 || data[1] !== 0x56 || data[2] !== 0x35) throw new Rv565Error("not an RV565 file");
  if (data[3] !== RV565_VERSION) throw new Rv565Error(`unsupported RV565 version ${data[3]}`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const header: Rv565Header = {
    width: view.getUint16(4, true),
    height: view.getUint16(6, true),
    fps: data[8],
    flags: data[9],
    frames: view.getUint16(10, true),
  };
  if (!header.width || !header.height || header.fps < 1 || header.fps > RV565_MAX_FPS || !header.frames) {
    throw new Rv565Error("invalid header");
  }
  const index: Array<[number, number]> = [];
  let offset = RV565_HEADER_SIZE;
  for (let i = 0; i < header.frames; i++) {
    if (data.length - offset < 4) throw new Rv565Error(`truncated frame table at frame ${i}`);
    const length = view.getUint32(offset, true);
    offset += 4;
    if (length === 0 || data.length - offset < length) throw new Rv565Error(`invalid length for frame ${i}`);
    index.push([offset, length]);
    offset += length;
  }
  if (offset !== data.length) throw new Rv565Error("trailing bytes after the last frame");
  return { header, data, index };
}

/** Inflate frame i to big-endian RGB565, checking its exact size. */
export async function decodeFrame(clip: Rv565Clip, i: number): Promise<Uint8Array> {
  const [offset, length] = clip.index[i];
  const frame = await zlibInflate(clip.data.subarray(offset, offset + length));
  const expected = 2 * clip.header.width * clip.header.height;
  if (frame.length !== expected) throw new Rv565Error(`frame ${i} inflates to ${frame.length} bytes, expected ${expected}`);
  return frame;
}

/* Schedulability: the paper's pooled ESP32-S3 decode-cost model. */
export const COST_ESP32S3_180x135 = { interceptUs: 4858.0, slopeUsPerByte: 0.1515 };
/** Display transfer per frame for a 320x240 panel at 40 MHz SPI. */
export const TRANSFER_320x240_US = 31312.0;

export type ScheduleReport = { lateFrames: number; worstFrameUs: number; periodUs: number; maxPayload: number };

export function checkSchedule(clip: Rv565Clip, overlap: boolean, transferUs = TRANSFER_320x240_US): ScheduleReport {
  const m = COST_ESP32S3_180x135;
  const periodUs = 1e6 / clip.header.fps;
  let lateFrames = 0, worstFrameUs = 0, maxPayload = 0;
  for (const [, length] of clip.index) {
    const inflate = m.interceptUs + m.slopeUsPerByte * length;
    const work = overlap ? Math.max(transferUs, inflate) : transferUs + inflate;
    if (work > periodUs) lateFrames++;
    worstFrameUs = Math.max(worstFrameUs, work);
    maxPayload = Math.max(maxPayload, length);
  }
  return { lateFrames, worstFrameUs, periodUs, maxPayload };
}

/** The container as a C header, matching `rv565 c-array`. */
export function toCArray(clip: Rv565Clip, sourceName: string, name = "rv565_clip"): string {
  const { width, height, fps, frames } = clip.header;
  const lines = [
    `/* Generated by tools/rv565.py from ${sourceName}: ${width}x${height}, ${fps} FPS, ${frames} frames. */`,
    "#pragma once", "#include <stddef.h>", "#include <stdint.h>", "",
    `static const uint8_t ${name}[] __attribute__((aligned(4))) = {`,
  ];
  const hex = (b: number) => "0x" + b.toString(16).padStart(2, "0");
  for (let i = 0; i < clip.data.length; i += 16) {
    lines.push("    " + Array.from(clip.data.subarray(i, i + 16), hex).join(", ") + ",");
  }
  lines.push("};", `static const size_t ${name}_size = sizeof(${name});`, "");
  return lines.join("\n");
}

/** Scrolling colour bars, identical to `rv565 testpattern` frames. */
export function testPatternFrame(f: number, count: number, width: number, height: number): Uint8Array {
  const bars = [[255, 255, 255], [255, 255, 0], [0, 255, 255], [0, 255, 0],
                [255, 0, 255], [255, 0, 0], [0, 0, 255], [0, 0, 0]];
  const shift = Math.floor((f * width) / count);
  const row = new Uint8Array(width * 2);
  for (let x = 0; x < width; x++) {
    const [r, g, b] = bars[Math.floor((((x + shift) % width) * bars.length) / width)];
    const v = ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
    row[2 * x] = v >> 8;
    row[2 * x + 1] = v & 0xff;
  }
  const out = new Uint8Array(width * height * 2);
  for (let y = 0; y < height; y++) out.set(row, y * row.length);
  return out;
}
