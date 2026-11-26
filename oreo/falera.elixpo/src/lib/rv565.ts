/* RV565 container (format versions 8 and 7, reads version 6) in the browser:
 * convert, encode, parse, decode.
 *
 * Mirrors the reference package in github.com/elixpo/rv565
 * (python/src/rv565, specified in docs/FORMAT.md):
 *
 *   header   "RV5", version, u16 width, u16 height, u8 fps, u8 flags,
 *            u16 frame count; version 7 adds u8 header size (16), u8 pixel
 *            format, u8 codec, u8 keyframe interval K; version 8 is version
 *            7 plus region deltas
 *   records  u32 length, u8 frame type (key / XOR delta / repeat / partial
 *            delta / region delta, version 8 only), body; version 6 records
 *            have no type byte and are all zlib keyframes of big-endian RGB565
 *
 * A partial delta carries only the bands of lines that changed (u8 band
 * height, a band mask, a (dx, dy) shift per changed band, then each band's
 * residual against its shifted prediction from the previous frame), so a
 * player decodes and sends only those bands to the display. A region delta
 * (version 8) is a partial delta whose changed bands also carry a byte range
 * (u16 x0, u16 xw, on whole pixels), and only that range of each line has a
 * residual, so a player sends one small window per band. The encoder writes
 * version 8 only when it used a region delta, so every other file stays
 * readable by version 7 players.
 *
 * Colour conversion follows the reference rules exactly, so a frame
 * converted here is byte-identical to `rv565.convert` in Python; the
 * conformance vectors in scripts/fixtures/rv565-v7 check that.
 *
 * zlib framing comes from CompressionStream("deflate"), which is RFC 1950
 * zlib despite the name, so no compression library ships with the page. Its
 * compression level differs from the reference encoder's (level 1), so the
 * files are not byte-identical, but every decoded frame is.
 */

export const RV565_VERSION = 7;
export const RV565_VERSION_6 = 6;
/** Version 7 plus region deltas (frame type 4). */
export const RV565_VERSION_8 = 8;
export const RV565_HEADER_SIZE = 16;
export const RV565_HEADER_SIZE_V6 = 12;
export const RV565_MAX_FPS = 60;
export const RV565_MAX_FPS_V6 = 30;
export const RV565_MAX_FRAMES = 0xffff;
export const RV565_MAX_KEYFRAME_INTERVAL = 255;

/** Pixel formats by header value (docs/FORMAT.md, Pixel formats). */
export const PIXEL_FORMATS = [
  "rgb565be", "rgb565le", "rgb444", "rgb666", "rgb888", "gray8", "gray4", "mono", "mono_vpage",
] as const;
export type PixelFormat = (typeof PIXEL_FORMATS)[number];

export const CODECS = ["stored", "zlib"] as const;
export type Codec = (typeof CODECS)[number];

export const KEYFRAME = 0, DELTA = 1, REPEAT = 2, PARTIAL = 3, REGION = 4;
export type FrameType = typeof KEYFRAME | typeof DELTA | typeof REPEAT | typeof PARTIAL | typeof REGION;
export const FRAME_TYPE_NAMES = ["key", "delta", "repeat", "partial", "region"] as const;
/** Default band height, in lines, of the reference encoder's partial deltas. */
export const RV565_BAND_LINES = 8;
/** Default shift search range, in pixels, of the reference encoder. */
export const RV565_MOTION_RANGE = 8;

export type Rv565Header = {
  version: number;
  width: number;
  height: number;
  fps: number;
  flags: number;
  frames: number;
  headerSize: number;
  pixelFormat: PixelFormat;
  codec: Codec;
  keyframeInterval: number;
  /** Decoded size of one frame in bytes. */
  frameBytes: number;
};

/** A parsed partial delta body: band height, changed bands, each changed
 * band's shift [dx bytes, dy lines], where the codec-encoded residuals start
 * in the body and how long they decode to. */
export type PartialLayout = {
  band: number; changed: number[]; shifts: Array<[number, number]>; start: number; size: number;
};

/** A parsed region delta body: a partial delta's fields plus each changed
 * band's byte range [x0, xw] along its lines. */
export type RegionLayout = PartialLayout & { ranges: Array<[number, number]> };

export type Rv565Record = {
  type: FrameType; offset: number; length: number; partial?: PartialLayout; region?: RegionLayout;
};

export type Rv565Clip = {
  header: Rv565Header;
  data: Uint8Array;
  /** Every frame's type and the [offset, length] of its body (0 for a repeat). */
  index: Rv565Record[];
  /** Last decoded frame, so playing in order costs one record per frame. */
  last?: { i: number; frame: Uint8Array };
};

export class Rv565Error extends Error {}

/* Pixel formats ----------------------------------------------------------- */

/** Bytes in one row of a frame (not defined for mono_vpage). */
export function rowBytes(format: PixelFormat, width: number): number {
  switch (format) {
    case "rgb565be": case "rgb565le": return 2 * width;
    case "rgb444": return (3 * width + 1) >> 1;
    case "rgb666": case "rgb888": return 3 * width;
    case "gray8": return width;
    case "gray4": return (width + 1) >> 1;
    case "mono": return (width + 7) >> 3;
    case "mono_vpage": throw new Rv565Error("mono_vpage has no rows");
  }
}

/** Decoded size in bytes of one frame. */
export function frameSize(format: PixelFormat, width: number, height: number): number {
  return format === "mono_vpage" ? width * ((height + 7) >> 3) : rowBytes(format, width) * height;
}

/** [P, R]: a frame is P lines of R bytes (pixel rows, or pages of 8 rows for
 * mono_vpage). Partial deltas divide the frame into bands of lines. */
export function frameLines(format: PixelFormat, width: number, height: number): [number, number] {
  return format === "mono_vpage" ? [(height + 7) >> 3, width] : [height, rowBytes(format, width)];
}

/** Parse the header part of a partial delta body (docs/FORMAT.md, Partial delta). */
export function partialLayout(body: Uint8Array, lines: number, lineBytes: number): PartialLayout {
  if (body.length < 1 || body[0] === 0) throw new Rv565Error("partial delta with band height 0");
  const band = body[0];
  const count = Math.ceil(lines / band);
  const maskLen = (count + 7) >> 3;
  if (body.length < 1 + maskLen) throw new Rv565Error("partial delta too short for its band mask");
  const changed: number[] = [];
  let size = 0;
  for (let b = 0; b < 8 * maskLen; b++) {
    if (!((body[1 + (b >> 3)] >> (b & 7)) & 1)) continue;
    if (b >= count) throw new Rv565Error("partial delta sets a band past the frame");
    changed.push(b);
    size += (Math.min(lines, (b + 1) * band) - b * band) * lineBytes;
  }
  if (!changed.length) throw new Rv565Error("partial delta with no changed band");
  const start = 1 + maskLen + 2 * changed.length;
  if (body.length < start) throw new Rv565Error("partial delta too short for its band shifts");
  const shifts: Array<[number, number]> = [];
  for (let k = 0; k < changed.length; k++) {
    const dx = (body[1 + maskLen + 2 * k] << 24) >> 24, dy = (body[2 + maskLen + 2 * k] << 24) >> 24;
    if (Math.abs(dy) >= band) throw new Rv565Error(`partial delta shifts a band by ${dy} lines, more than it has`);
    shifts.push([dx, dy]);
  }
  return { band, changed, shifts, start, size };
}

/** Byte ranges of region deltas start and end on whole pixels: a range is a
 * multiple of this many bytes, or runs to the end of the line (rv565._ALIGN). */
export const RV565_ALIGN: Record<PixelFormat, number> = {
  rgb565be: 2, rgb565le: 2, rgb444: 3, rgb666: 3, rgb888: 3, gray8: 1, gray4: 1, mono: 1, mono_vpage: 1,
};

/** Parse the header part of a region delta body (docs/FORMAT.md, Region delta). */
export function regionLayout(body: Uint8Array, lines: number, lineBytes: number, align: number): RegionLayout {
  if (body.length < 1 || body[0] === 0) throw new Rv565Error("region delta with band height 0");
  const band = body[0];
  const count = Math.ceil(lines / band);
  const maskLen = (count + 7) >> 3;
  if (body.length < 1 + maskLen) throw new Rv565Error("region delta too short for its band mask");
  const changed: number[] = [];
  for (let b = 0; b < 8 * maskLen; b++) {
    if (!((body[1 + (b >> 3)] >> (b & 7)) & 1)) continue;
    if (b >= count) throw new Rv565Error("region delta sets a band past the frame");
    changed.push(b);
  }
  if (!changed.length) throw new Rv565Error("region delta with no changed band");
  const start = 1 + maskLen + 6 * changed.length;
  if (body.length < start) throw new Rv565Error("region delta too short for its band entries");
  const shifts: Array<[number, number]> = [], ranges: Array<[number, number]> = [];
  let size = 0;
  changed.forEach((b, k) => {
    const o = 1 + maskLen + 6 * k;
    const dx = (body[o] << 24) >> 24, dy = (body[o + 1] << 24) >> 24;
    const x0 = body[o + 2] | (body[o + 3] << 8), xw = body[o + 4] | (body[o + 5] << 8);
    if (Math.abs(dy) >= band) throw new Rv565Error(`region delta shifts a band by ${dy} lines, more than it has`);
    if (xw === 0 || x0 + xw > lineBytes || x0 % align || ((x0 + xw) % align && x0 + xw !== lineBytes)) {
      throw new Rv565Error(`region delta band ${b} has an invalid range ${x0}+${xw}`);
    }
    shifts.push([dx, dy]);
    ranges.push([x0, xw]);
    size += (Math.min(lines, (b + 1) * band) - b * band) * xw;
  });
  return { band, changed, shifts, ranges, start, size };
}

/* Prediction of a band: byte j of line y is byte j - dx of line y - dy of
 * prev when that line is in the same band [first, end) and 0 <= j - dx < R,
 * else 0. residual = band XOR prediction; band = prediction XOR residual. */

/** Bytes [x0, x0 + xw) of band lines [first, end) of `cur` XOR their shifted
 * prediction from prev, line by line (the whole lines by default). */
function bandResidual(
  cur: Uint8Array, prev: Uint8Array, first: number, end: number, R: number, dx: number, dy: number, x0 = 0, xw = R,
): Uint8Array {
  const out = new Uint8Array((end - first) * xw);
  for (let y = first; y < end; y++) {
    const o = (y - first) * xw;
    out.set(cur.subarray(y * R + x0, y * R + x0 + xw), o);
    const src = y - dy;
    if (src < first || src >= end) continue;
    const s = src * R;
    for (let j = Math.max(x0, dx); j < Math.min(x0 + xw, R + dx); j++) out[o + j - x0] ^= prev[s + j - dx];
  }
  return out;
}

/** Nonzero bytes of bandResidual, stopping once it reaches `limit`. */
function residualCost(
  cur: Uint8Array, prev: Uint8Array, first: number, end: number, R: number, dx: number, dy: number, limit: number,
  x0 = 0, xw = R,
): number {
  let cost = 0;
  for (let y = first; y < end; y++) {
    const src = y - dy, o = y * R;
    const inBand = src >= first && src < end, s = src * R;
    for (let j = x0; j < x0 + xw; j++) {
      const k = j - dx;
      const p = inBand && k >= 0 && k < R ? prev[s + k] : 0;
      if (cur[o + j] !== p && ++cost >= limit) return cost;
    }
  }
  return cost;
}

/** Decode one changed band in place: bytes [x0, x0 + xw) of out's lines
 * [first, end) become the prediction from prev XOR the residual at
 * data[pos...], xw bytes per line (the whole lines by default). */
function decodeBand(
  out: Uint8Array, prev: Uint8Array, data: Uint8Array, pos: number, first: number, end: number, R: number,
  dx: number, dy: number, x0 = 0, xw = R,
) {
  for (let y = first; y < end; y++) {
    const src = y - dy, o = y * R, r = pos + (y - first) * xw - x0;
    const inBand = src >= first && src < end, s = src * R;
    for (let j = x0; j < x0 + xw; j++) {
      const k = j - dx;
      out[o + j] = (inBand && k >= 0 && k < R ? prev[s + k] : 0) ^ data[r + j];
    }
  }
}

/** [x0, xw]: the bytes of band lines [first, end) that differ between cur and
 * old, widened to whole pixels, or null if none do (rv565._changed_range). */
function changedRange(cur: Uint8Array, old: Uint8Array, first: number, end: number, R: number, align: number): [number, number] | null {
  let lo = R, hi = -1;
  for (let y = first; y < end; y++) {
    const o = y * R;
    let i = 0;
    while (i < R && cur[o + i] === old[o + i]) i++;
    if (i === R) continue;
    let j = R - 1;
    while (cur[o + j] === old[o + j]) j--;
    lo = Math.min(lo, i);
    hi = Math.max(hi, j);
  }
  if (hi < 0) return null;
  const x0 = lo - (lo % align);
  const x1 = Math.min(R, hi + 1 + ((align - ((hi + 1) % align)) % align));
  return [x0, x1 - x0];
}

/** (step, max) of the horizontal shift search in bytes, for a range in pixels
 * (rv565._shift_steps). */
export function shiftSteps(format: PixelFormat, m: number): [number, number] {
  switch (format) {
    case "rgb565be": case "rgb565le": return [2, 2 * m];
    case "rgb666": case "rgb888": return [3, 3 * m];
    case "rgb444": return [3, 3 * Math.floor(m / 2)];
    case "gray8": case "mono_vpage": return [1, m];
    case "gray4": return [1, Math.floor(m / 2)];
    case "mono": return [1, Math.floor(m / 8)];
  }
}

/** 0, -step, +step, -2 step, ... up to limit. */
function alternating(limit: number, step = 1): number[] {
  const out = [0];
  for (let k = step; k <= limit; k += step) out.push(-k, k);
  return out;
}

const luma = (r: number, g: number, b: number) => Math.floor((299 * r + 587 * g + 114 * b + 500) / 1000);

/** Packed pixels (RGB888 with `channels` 3, or canvas RGBA with 4) to one
 * frame in `format`, with the conversions in docs/FORMAT.md, Writing. */
export function convertPixels(
  src: Uint8Array | Uint8ClampedArray, width: number, height: number, format: PixelFormat, channels: 3 | 4 = 4,
): Uint8Array {
  if (src.length !== channels * width * height) {
    throw new Rv565Error(`expected ${channels * width * height} bytes of pixels, got ${src.length}`);
  }
  const out = new Uint8Array(frameSize(format, width, height));
  const n = width * height;
  switch (format) {
    case "rgb565be":
    case "rgb565le": {
      const [h, l] = format === "rgb565be" ? [0, 1] : [1, 0];
      for (let p = 0, i = 0; p < n; p++, i += channels) {
        const r = src[i], g = src[i + 1], b = src[i + 2];
        out[2 * p + h] = (r & 0xf8) | (g >> 5);
        out[2 * p + l] = ((g & 0x1c) << 3) | (b >> 3);
      }
      return out;
    }
    case "rgb888":
    case "rgb666": {
      const mask = format === "rgb666" ? 0xfc : 0xff;
      for (let p = 0, i = 0; p < n; p++, i += channels) {
        out[3 * p] = src[i] & mask;
        out[3 * p + 1] = src[i + 1] & mask;
        out[3 * p + 2] = src[i + 2] & mask;
      }
      return out;
    }
    case "rgb444": {
      const stride = rowBytes(format, width);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = channels * (y * width + x);
          for (let k = 0; k < 3; k++) {
            const nib = 3 * x + k;
            out[y * stride + (nib >> 1)] |= (src[i + k] >> 4) << (nib & 1 ? 0 : 4);
          }
        }
      }
      return out;
    }
    default: {
      const stride = format === "mono_vpage" ? 0 : rowBytes(format, width);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = channels * (y * width + x);
          const v = luma(src[i], src[i + 1], src[i + 2]);
          if (format === "gray8") out[y * width + x] = v;
          else if (format === "gray4") out[y * stride + (x >> 1)] |= (v >> 4) << (x & 1 ? 0 : 4);
          else if (v >= 128) {
            if (format === "mono") out[y * stride + (x >> 3)] |= 0x80 >> (x & 7);
            else out[(y >> 3) * width + x] |= 1 << (y & 7);
          }
        }
      }
      return out;
    }
  }
}

const expand = (bits: number) => {
  const top = (1 << bits) - 1;
  return Uint8Array.from({ length: 1 << bits }, (_, v) => Math.floor((v * 255 + (top >> 1)) / top));
};
const E5 = expand(5), E6 = expand(6);

/** One frame in `format` to RGBA pixels, for previews; the same values as the
 * reference `rv565.to_rgb888` (channels with fewer bits scaled to 0-255). */
export function toRgba(
  frame: Uint8Array, width: number, height: number, format: PixelFormat, out?: Uint8ClampedArray,
): Uint8ClampedArray {
  if (frame.length !== frameSize(format, width, height)) {
    throw new Rv565Error(`expected ${frameSize(format, width, height)} bytes, got ${frame.length}`);
  }
  const rgba = out ?? new Uint8ClampedArray(4 * width * height);
  const stride = format === "mono_vpage" ? 0 : rowBytes(format, width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x, o = 4 * p;
      let r: number, g: number, b: number;
      switch (format) {
        case "rgb565be":
        case "rgb565le": {
          const hi = frame[2 * p + (format === "rgb565be" ? 0 : 1)];
          const lo = frame[2 * p + (format === "rgb565be" ? 1 : 0)];
          r = E5[hi >> 3]; g = E6[((hi & 7) << 3) | (lo >> 5)]; b = E5[lo & 0x1f];
          break;
        }
        case "rgb888": r = frame[3 * p]; g = frame[3 * p + 1]; b = frame[3 * p + 2]; break;
        case "rgb666": r = E6[frame[3 * p] >> 2]; g = E6[frame[3 * p + 1] >> 2]; b = E6[frame[3 * p + 2] >> 2]; break;
        case "rgb444": {
          const nib = (k: number) => {
            const n = 3 * x + k;
            return ((frame[y * stride + (n >> 1)] >> (n & 1 ? 0 : 4)) & 0xf) * 17;
          };
          r = nib(0); g = nib(1); b = nib(2);
          break;
        }
        case "gray8": r = g = b = frame[p]; break;
        case "gray4": {
          const byte = frame[y * stride + (x >> 1)];
          r = g = b = (x & 1 ? byte & 0xf : byte >> 4) * 17;
          break;
        }
        case "mono": r = g = b = frame[y * stride + (x >> 3)] & (0x80 >> (x & 7)) ? 255 : 0; break;
        default: r = g = b = frame[(y >> 3) * width + x] & (1 << (y & 7)) ? 255 : 0;
      }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
    }
  }
  return rgba;
}

/** RGBA pixels (canvas ImageData) to big-endian RGB565. */
export const rgbaToRgb565be = (rgba: Uint8ClampedArray | Uint8Array) =>
  convertPixels(rgba, rgba.length / 4, 1, "rgb565be");

/** Big-endian RGB565 to RGBA pixels. */
export const rgb565beToRgba = (src: Uint8Array, out?: Uint8ClampedArray) =>
  toRgba(src, src.length / 2, 1, "rgb565be", out);

/* zlib -------------------------------------------------------------------- */

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const piped = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

export const zlibCompress = (data: Uint8Array) => pipe(data, new CompressionStream("deflate"));
export const zlibInflate = (data: Uint8Array) => pipe(data, new DecompressionStream("deflate"));

/** Inflate a body that must give exactly `size` bytes; stops reading as soon
 * as it gives more, so a hostile file cannot fill the tab's memory. */
async function inflateExact(body: Uint8Array, size: number, i: number): Promise<Uint8Array> {
  const reader = new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate")).getReader();
  const out = new Uint8Array(size);
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (n + value.length > size) {
        reader.cancel().catch(() => {});
        throw new Rv565Error(`frame ${i} inflates to more than ${size} bytes`);
      }
      out.set(value, n);
      n += value.length;
    }
  } catch (e) {
    if (e instanceof Rv565Error) throw e;
    throw new Rv565Error(`frame ${i} does not inflate: ${e instanceof Error ? e.message : e}`);
  }
  if (n !== size) throw new Rv565Error(`frame ${i} inflates to ${n} bytes, expected ${size}`);
  return out;
}

const xor = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
  return out;
};

const equal = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/* Encoding ---------------------------------------------------------------- */

export type EncodeOptions = {
  /** Left out (the default): version 8 if a region delta was written, else
   * 7, as the reference `rv565.write(version=None)`. 7 never writes region
   * deltas (for RV565 2.x players); 8 always says version 8; 6 is for
   * players older than RV565 2.0 (rgb565be, zlib, K = 1 only). */
  version?: 6 | 7 | 8;
  pixelFormat?: PixelFormat;
  codec?: Codec;
  /** A keyframe at least every K frames (1-255). */
  keyframeInterval?: number;
  /** Band height in lines for partial deltas (1-255, default 8); 0 turns them off. */
  bandLines?: number;
  /** 0-255, default 0 (lossless): keep a pixel of the previous decoded frame
   * wherever every channel of the new one, in 8 bits, is within this. */
  tolerance?: number;
  /** Shift search range of partial-delta bands, in pixels (0-255, default 8); 0 turns it off. */
  motionRange?: number;
};

/** Writes a clip one frame at a time, holding only the previous frame and the
 * encoded records. Frame choice is the reference encoder's
 * (rv565.encode_frames): frames at multiples of K are keyframes; any other
 * frame is a repeat when it equals the previous one, else the smallest of a
 * keyframe, a delta (zlib only: a stored delta is never smaller), a partial
 * delta and a region delta (unless version 7 was asked for), except that a
 * region delta, then a partial delta, wins whenever it is at most 2% (and at
 * least 16 bytes) larger, since it saves the display transfer of everything
 * unchanged. A region delta is not built when every changed band changed
 * across its whole width (the partial delta says the same in fewer bytes).
 * Each changed band gets the first shift, in the reference search order,
 * with the fewest nonzero residual bytes (inside its range, for a region
 * delta).
 * With a tolerance, each frame first keeps the previous
 * decoded pixel wherever the new one is within the tolerance. */
export class Rv565Encoder {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** As asked for; undefined means 8 if a region delta is written, else 7. */
  readonly version: 6 | 7 | 8 | undefined;
  /** Whether region deltas are considered (not for version 6 or 7). */
  readonly regions: boolean;
  readonly pixelFormat: PixelFormat;
  readonly codec: Codec;
  readonly keyframeInterval: number;
  readonly bandLines: number;
  readonly tolerance: number;
  readonly motionRange: number;
  readonly frameBytes: number;
  private prev: Uint8Array | null = null;
  private records: Array<{ type: FrameType; body: Uint8Array }> = [];
  private usedRegions = false;

  constructor(width: number, height: number, fps: number, options: EncodeOptions = {}) {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.version = options.version;
    this.regions = this.version === undefined || this.version === RV565_VERSION_8;
    this.pixelFormat = options.pixelFormat ?? "rgb565be";
    this.codec = options.codec ?? "zlib";
    this.keyframeInterval = options.keyframeInterval ?? 1;
    this.bandLines = options.bandLines ?? RV565_BAND_LINES;
    this.tolerance = options.tolerance ?? 0;
    this.motionRange = options.motionRange ?? RV565_MOTION_RANGE;
    if (!(Number.isInteger(width) && width > 0 && width <= 0xffff && Number.isInteger(height) && height > 0 && height <= 0xffff)) {
      throw new Rv565Error(`size ${width}x${height} out of range`);
    }
    if (!PIXEL_FORMATS.includes(this.pixelFormat)) throw new Rv565Error(`unknown pixel format ${this.pixelFormat}`);
    if (!CODECS.includes(this.codec)) throw new Rv565Error(`unknown codec ${this.codec}`);
    const k = this.keyframeInterval;
    if (!(Number.isInteger(k) && k >= 1 && k <= RV565_MAX_KEYFRAME_INTERVAL)) throw new Rv565Error("keyframe interval must be 1-255");
    if (!(Number.isInteger(this.bandLines) && this.bandLines >= 0 && this.bandLines <= 255)) throw new Rv565Error("band height must be 0-255");
    if (!(Number.isInteger(this.tolerance) && this.tolerance >= 0 && this.tolerance <= 255)) throw new Rv565Error("tolerance must be 0-255");
    if (!(Number.isInteger(this.motionRange) && this.motionRange >= 0 && this.motionRange <= 255)) throw new Rv565Error("motion range must be 0-255");
    if (this.version === RV565_VERSION_6) {
      if (this.pixelFormat !== "rgb565be" || this.codec !== "zlib" || k !== 1) {
        throw new Rv565Error("version 6 supports only rgb565be, zlib, keyframe interval 1");
      }
      if (!(fps >= 1 && fps <= RV565_MAX_FPS_V6)) throw new Rv565Error(`fps must be 1-${RV565_MAX_FPS_V6}`);
    } else if (this.version === undefined || this.version === RV565_VERSION || this.version === RV565_VERSION_8) {
      if (!(fps >= 1 && fps <= RV565_MAX_FPS)) throw new Rv565Error(`fps must be 1-${RV565_MAX_FPS}`);
    } else {
      throw new Rv565Error(`can write version 6, 7 or 8, not ${this.version}`);
    }
    this.frameBytes = frameSize(this.pixelFormat, width, height);
  }

  get frames() { return this.records.length; }

  /** The version finish() writes, given the frames added so far. */
  get fileVersion(): 6 | 7 | 8 {
    return this.version ?? (this.usedRegions ? RV565_VERSION_8 : RV565_VERSION);
  }

  private encode(data: Uint8Array) {
    return this.codec === "stored" ? data.slice() : zlibCompress(data);
  }

  /** Keep each pixel of prev where every channel of frame, in 8 bits, is
   * within the tolerance of it; the result is what the decoder will show. */
  private applyTolerance(frame: Uint8Array, prev: Uint8Array): Uint8Array {
    const { width: w, height: h, pixelFormat: fmt, tolerance: t } = this;
    const mixed = toRgba(frame, w, h, fmt);
    const old = toRgba(prev, w, h, fmt);
    for (let o = 0; o < mixed.length; o += 4) {
      if (Math.abs(mixed[o] - old[o]) <= t && Math.abs(mixed[o + 1] - old[o + 1]) <= t && Math.abs(mixed[o + 2] - old[o + 2]) <= t) {
        mixed[o] = old[o]; mixed[o + 1] = old[o + 1]; mixed[o + 2] = old[o + 2];
      }
    }
    return convertPixels(mixed, w, h, fmt, 4);
  }

  /** The shift of band lines [first, end) whose residual over bytes
   * [x0, x0 + xw) has the fewest nonzero bytes, as rv565._partial_body and
   * rv565._region_body search: dy 0, -1, +1, ...; for each, dx 0, -s, +s, ...;
   * the first shift with the fewest wins. */
  private searchShift(
    frame: Uint8Array, prev: Uint8Array, first: number, end: number, lineBytes: number, x0: number, xw: number,
  ): [number, number] {
    const m = this.motionRange;
    let [step, maxDx] = m ? shiftSteps(this.pixelFormat, m) : [1, 0];
    const maxDy = m ? Math.min(this.bandLines - 1, 127) : 0;
    maxDx = Math.min(maxDx, 127 - (127 % step));
    let bestCost = residualCost(frame, prev, first, end, lineBytes, 0, 0, Infinity, x0, xw);
    let best: [number, number] = [0, 0];
    if (!bestCost || !(maxDx || maxDy)) return best;
    const dxs = alternating(maxDx, step);
    for (const dy of alternating(Math.min(maxDy, end - first - 1))) {
      for (const dx of dxs) {
        if (dx === 0 && dy === 0) continue;
        const cost = residualCost(frame, prev, first, end, lineBytes, dx, dy, bestCost, x0, xw);
        if (cost < bestCost) {
          bestCost = cost;
          best = [dx, dy];
          if (cost === 0) return best;
        }
      }
    }
    return best;
  }

  /** u8 band height, band mask, per-band entries, then the encoded residuals. */
  private async bandedBody(band: number, mask: Uint8Array, entries: number[], parts: Uint8Array[]): Promise<Uint8Array> {
    const joined = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
    parts.reduce((at, x) => (joined.set(x, at), at + x.length), 0);
    const data = await this.encode(joined);
    const head = 1 + mask.length + entries.length;
    const out = new Uint8Array(head + data.length);
    out[0] = band;
    out.set(mask, 1);
    out.set(entries, 1 + mask.length);
    out.set(data, head);
    return out;
  }

  /** Body of a partial delta, or null when no band changed. Records each
   * changed band's shift in `found`, for the region delta. */
  private async partialBody(frame: Uint8Array, prev: Uint8Array, found: Map<number, [number, number]>): Promise<Uint8Array | null> {
    const band = this.bandLines;
    const [lines, lineBytes] = frameLines(this.pixelFormat, this.width, this.height);
    const count = Math.ceil(lines / band);
    const mask = new Uint8Array((count + 7) >> 3);
    const shifts: number[] = [];
    const parts: Uint8Array[] = [];
    for (let b = 0; b < count; b++) {
      const first = b * band, end = Math.min(lines, (b + 1) * band);
      const lo = first * lineBytes, hi = end * lineBytes;
      if (equal(frame.subarray(lo, hi), prev.subarray(lo, hi))) continue;
      mask[b >> 3] |= 1 << (b & 7);
      const [dx, dy] = this.searchShift(frame, prev, first, end, lineBytes, 0, lineBytes);
      found.set(b, [dx, dy]);
      shifts.push(dx & 0xff, dy & 0xff);
      parts.push(bandResidual(frame, prev, first, end, lineBytes, dx, dy));
    }
    if (!parts.length) return null;
    return this.bandedBody(band, mask, shifts, parts);
  }

  /** Body of a region delta (rv565._region_body), or null when no band
   * changed or every changed band changed across its whole width. A band
   * whose range is the whole line searches exactly as in the partial delta,
   * so it reuses that band's shift from `found`. */
  private async regionBody(frame: Uint8Array, prev: Uint8Array, found: Map<number, [number, number]>): Promise<Uint8Array | null> {
    const band = this.bandLines;
    const [lines, lineBytes] = frameLines(this.pixelFormat, this.width, this.height);
    const count = Math.ceil(lines / band);
    const align = RV565_ALIGN[this.pixelFormat];
    const changed: Array<[number, number, number]> = [];
    let narrower = false;
    for (let b = 0; b < count; b++) {
      const range = changedRange(frame, prev, b * band, Math.min(lines, (b + 1) * band), lineBytes, align);
      if (!range) continue;
      changed.push([b, range[0], range[1]]);
      narrower ||= range[1] < lineBytes;
    }
    if (!narrower) return null;
    const mask = new Uint8Array((count + 7) >> 3);
    const entries: number[] = [];
    const parts: Uint8Array[] = [];
    for (const [b, x0, xw] of changed) {
      const first = b * band, end = Math.min(lines, (b + 1) * band);
      mask[b >> 3] |= 1 << (b & 7);
      const [dx, dy] = (xw === lineBytes && found.get(b)) || this.searchShift(frame, prev, first, end, lineBytes, x0, xw);
      entries.push(dx & 0xff, dy & 0xff, x0 & 0xff, x0 >> 8, xw & 0xff, xw >> 8);
      parts.push(bandResidual(frame, prev, first, end, lineBytes, dx, dy, x0, xw));
    }
    return this.bandedBody(band, mask, entries, parts);
  }

  /** Add one frame, already in the clip's pixel format; returns its type. */
  async add(source: Uint8Array): Promise<FrameType> {
    const i = this.records.length;
    if (i >= RV565_MAX_FRAMES) throw new Rv565Error(`more than ${RV565_MAX_FRAMES} frames`);
    if (source.length !== this.frameBytes) throw new Rv565Error(`frame ${i} has ${source.length} bytes, expected ${this.frameBytes}`);
    const prev = this.prev;
    const frame = this.tolerance && prev ? this.applyTolerance(source, prev) : source;
    let record: { type: FrameType; body: Uint8Array };
    if (i % this.keyframeInterval === 0 || !prev) {
      record = { type: KEYFRAME, body: await this.encode(frame) };
    } else if (equal(frame, prev)) {
      record = { type: REPEAT, body: new Uint8Array(0) };
    } else {
      const options: Array<{ type: FrameType; body: Uint8Array }> = [{ type: KEYFRAME, body: await this.encode(frame) }];
      if (this.codec !== "stored") options.push({ type: DELTA, body: await this.encode(xor(frame, prev)) });
      const found = new Map<number, [number, number]>();
      const partialBody = this.bandLines ? await this.partialBody(frame, prev, found) : null;
      if (partialBody) options.push({ type: PARTIAL, body: partialBody });
      const regionBody = this.bandLines && this.regions ? await this.regionBody(frame, prev, found) : null;
      if (regionBody) options.push({ type: REGION, body: regionBody });
      // The smallest body, a delta winning ties (as min() over (length,
      // type != delta) in the reference); then the region delta, else the
      // partial delta, if it is within 2% (at least 16 bytes) of that.
      let best = options[0];
      for (const o of options.slice(1)) {
        if (o.body.length < best.body.length || (o.body.length === best.body.length && o.type === DELTA && best.type !== DELTA)) best = o;
      }
      const slack = best.body.length + Math.max(16, Math.floor(best.body.length / 50));
      if (regionBody && regionBody.length <= slack) best = { type: REGION, body: regionBody };
      else if (partialBody && partialBody.length <= slack) best = { type: PARTIAL, body: partialBody };
      record = best;
    }
    this.records.push(record);
    if (record.type === REGION) this.usedRegions = true;
    this.prev = frame === source ? source.slice() : frame;
    return record.type;
  }

  /** The finished file. */
  finish(): Uint8Array {
    const n = this.records.length;
    if (n === 0) throw new Rv565Error("no frames");
    const v6 = this.version === RV565_VERSION_6;
    const headerSize = v6 ? RV565_HEADER_SIZE_V6 : RV565_HEADER_SIZE;
    const perRecord = v6 ? 4 : 5;
    const out = new Uint8Array(this.records.reduce((t, r) => t + perRecord + r.body.length, headerSize));
    const view = new DataView(out.buffer);
    out.set([0x52, 0x56, 0x35, this.fileVersion], 0);
    view.setUint16(4, this.width, true);
    view.setUint16(6, this.height, true);
    out[8] = this.fps;
    out[9] = 0;
    view.setUint16(10, n, true);
    if (!v6) {
      out[12] = RV565_HEADER_SIZE;
      out[13] = PIXEL_FORMATS.indexOf(this.pixelFormat);
      out[14] = CODECS.indexOf(this.codec);
      out[15] = this.keyframeInterval;
    }
    let offset = headerSize;
    for (const { type, body } of this.records) {
      view.setUint32(offset, body.length + (v6 ? 0 : 1), true);
      offset += 4;
      if (!v6) out[offset++] = type;
      out.set(body, offset);
      offset += body.length;
    }
    return out;
  }
}

/** Encode frames (already in the pixel format) into a whole file. */
export async function encodeClip(
  width: number, height: number, fps: number, frames: Iterable<Uint8Array>, options: EncodeOptions = {},
): Promise<Uint8Array> {
  const encoder = new Rv565Encoder(width, height, fps, options);
  for (const frame of frames) await encoder.add(frame);
  return encoder.finish();
}

/* Decoding ---------------------------------------------------------------- */

/** Parse and range-check a version 6, 7 or 8 header. */
export function parseHeader(data: Uint8Array): Rv565Header {
  if (data.length < RV565_HEADER_SIZE_V6) throw new Rv565Error("file too short");
  if (data[0] !== 0x52 || data[1] !== 0x56 || data[2] !== 0x35) throw new Rv565Error("not an RV565 file");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = data[3];
  const width = view.getUint16(4, true), height = view.getUint16(6, true);
  const fps = data[8], flags = data[9], frames = view.getUint16(10, true);
  if (version === RV565_VERSION_6) {
    if (!width || !height || fps < 1 || fps > RV565_MAX_FPS_V6 || !frames) throw new Rv565Error("invalid header");
    return {
      version, width, height, fps, flags, frames, headerSize: RV565_HEADER_SIZE_V6,
      pixelFormat: "rgb565be", codec: "zlib", keyframeInterval: 1, frameBytes: 2 * width * height,
    };
  }
  if (version !== RV565_VERSION && version !== RV565_VERSION_8) throw new Rv565Error(`unsupported RV565 version ${version}`);
  if (data.length < RV565_HEADER_SIZE) throw new Rv565Error("file too short");
  if (!width || !height || fps < 1 || fps > RV565_MAX_FPS || !frames) throw new Rv565Error("invalid header");
  const headerSize = data[12], format = data[13], codec = data[14], keyframeInterval = data[15];
  if (headerSize < RV565_HEADER_SIZE || data.length < headerSize) throw new Rv565Error(`invalid header size ${headerSize}`);
  if (format >= PIXEL_FORMATS.length) throw new Rv565Error(`unsupported pixel format ${format}`);
  if (codec >= CODECS.length) throw new Rv565Error(`unsupported codec ${codec}`);
  if (keyframeInterval === 0) throw new Rv565Error("invalid keyframe interval 0");
  const pixelFormat = PIXEL_FORMATS[format];
  return {
    version, width, height, fps, flags, frames, headerSize, pixelFormat, codec: CODECS[codec],
    keyframeInterval, frameBytes: frameSize(pixelFormat, width, height),
  };
}

/** Validate a whole container and index its frames (docs/FORMAT.md,
 * Validation): everything except whether each zlib body inflates to the
 * frame size, which decodeFrame and verify check. */
export function parseContainer(data: Uint8Array): Rv565Clip {
  const header = parseHeader(data);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const v6 = header.version === RV565_VERSION_6;
  const index: Rv565Record[] = [];
  let offset = header.headerSize;
  for (let i = 0; i < header.frames; i++) {
    if (data.length - offset < 4) throw new Rv565Error(`truncated frame table at frame ${i}`);
    const length = view.getUint32(offset, true);
    offset += 4;
    if (length === 0 || data.length - offset < length) throw new Rv565Error(`invalid length for frame ${i}`);
    if (v6) {
      index.push({ type: KEYFRAME, offset, length });
    } else {
      const type = data[offset];
      if (type > REGION || (type === REGION && header.version < RV565_VERSION_8)) {
        throw new Rv565Error(`unsupported frame type ${type} at frame ${i}`);
      }
      if (i % header.keyframeInterval === 0 && type !== KEYFRAME) throw new Rv565Error(`frame ${i} must be a keyframe`);
      if (type === REPEAT && length !== 1) throw new Rv565Error(`repeat frame ${i} has a body`);
      if ((type === KEYFRAME || type === DELTA) && header.codec === "stored" && length - 1 !== header.frameBytes) {
        throw new Rv565Error(`stored frame ${i} has ${length - 1} bytes, expected ${header.frameBytes}`);
      }
      const record: Rv565Record = { type: type as FrameType, offset: offset + 1, length: length - 1 };
      if (type === PARTIAL) {
        const [lines, lineBytes] = frameLines(header.pixelFormat, header.width, header.height);
        const layout = partialLayout(data.subarray(offset + 1, offset + length), lines, lineBytes);
        if (header.codec === "stored" && length - 1 - layout.start !== layout.size) {
          throw new Rv565Error(`stored partial frame ${i} has ${length - 1 - layout.start} bytes, expected ${layout.size}`);
        }
        record.partial = layout;
      }
      if (type === REGION) {
        const [lines, lineBytes] = frameLines(header.pixelFormat, header.width, header.height);
        const layout = regionLayout(data.subarray(offset + 1, offset + length), lines, lineBytes, RV565_ALIGN[header.pixelFormat]);
        if (header.codec === "stored" && length - 1 - layout.start !== layout.size) {
          throw new Rv565Error(`stored region frame ${i} has ${length - 1 - layout.start} bytes, expected ${layout.size}`);
        }
        record.region = layout;
      }
      index.push(record);
    }
    offset += length;
  }
  if (offset !== data.length) throw new Rv565Error("trailing bytes after the last frame");
  return { header, data, index };
}

async function body(clip: Rv565Clip, i: number): Promise<Uint8Array> {
  const { offset, length } = clip.index[i];
  const raw = clip.data.subarray(offset, offset + length);
  return clip.header.codec === "stored" ? raw.slice() : inflateExact(raw, clip.header.frameBytes, i);
}

/** prev with each changed band of partial delta i replaced by its prediction
 * XOR its residual. */
async function applyPartial(clip: Rv565Clip, i: number, prev: Uint8Array): Promise<Uint8Array> {
  const { offset, length, partial } = clip.index[i];
  const { band, changed, shifts, start, size } = partial!;
  const raw = clip.data.subarray(offset + start, offset + length);
  const data = clip.header.codec === "stored" ? raw : await inflateExact(raw, size, i);
  const [lines, lineBytes] = frameLines(clip.header.pixelFormat, clip.header.width, clip.header.height);
  const out = prev.slice();
  let pos = 0;
  changed.forEach((b, k) => {
    const first = b * band, end = Math.min(lines, (b + 1) * band);
    decodeBand(out, prev, data, pos, first, end, lineBytes, shifts[k][0], shifts[k][1]);
    pos += (end - first) * lineBytes;
  });
  return out;
}

/** prev with the range of each changed band of region delta i replaced by
 * its prediction XOR its residual. */
async function applyRegion(clip: Rv565Clip, i: number, prev: Uint8Array): Promise<Uint8Array> {
  const { offset, length, region } = clip.index[i];
  const { band, changed, shifts, ranges, start, size } = region!;
  const raw = clip.data.subarray(offset + start, offset + length);
  const data = clip.header.codec === "stored" ? raw : await inflateExact(raw, size, i);
  const [lines, lineBytes] = frameLines(clip.header.pixelFormat, clip.header.width, clip.header.height);
  const out = prev.slice();
  let pos = 0;
  changed.forEach((b, k) => {
    const first = b * band, end = Math.min(lines, (b + 1) * band);
    const [x0, xw] = ranges[k];
    decodeBand(out, prev, data, pos, first, end, lineBytes, shifts[k][0], shifts[k][1], x0, xw);
    pos += (end - first) * xw;
  });
  return out;
}

/** Line ranges [first, count] that frame i changes, so a player knows what to
 * send to the display: everything for a keyframe or delta, nothing for a
 * repeat, the changed bands (merged into runs) for a partial delta. Lines are
 * pixel rows, or pages of 8 rows for mono_vpage. */
export function changedLines(clip: Rv565Clip, i: number): Array<[number, number]> {
  const { pixelFormat, width, height } = clip.header;
  const lines = frameLines(pixelFormat, width, height)[0];
  const { type } = clip.index[i];
  if (type === REPEAT) return [];
  if (type !== PARTIAL && type !== REGION) return [[0, lines]];
  const layout = (clip.index[i].partial ?? clip.index[i].region)!;
  const runs: Array<[number, number]> = [];
  for (const b of layout.changed) {
    const first = b * layout.band, end = Math.min(lines, (b + 1) * layout.band);
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === first) last[1] = end - last[0];
    else runs.push([first, end - first]);
  }
  return runs;
}

/** Rectangles [first line, line count, first byte, byte count] that frame i
 * changes, as the reference `Clip.changed_rects`: one per changed band of a
 * region delta, the runs of changed lines (whole lines) otherwise. A player
 * sends each to the display as one window. */
export function changedRects(clip: Rv565Clip, i: number): Array<[number, number, number, number]> {
  const { pixelFormat, width, height } = clip.header;
  const [lines, lineBytes] = frameLines(pixelFormat, width, height);
  const { type, region } = clip.index[i];
  if (type === REGION) {
    return region!.changed.map((b, k) => [
      b * region!.band, Math.min(lines, (b + 1) * region!.band) - b * region!.band, region!.ranges[k][0], region!.ranges[k][1],
    ]);
  }
  return changedLines(clip, i).map(([first, count]) => [first, count, 0, lineBytes]);
}

/** Share of all frame bytes (so, pixels) that the clip sends to the display (0-1). */
export function bytesSentFraction(clip: Rv565Clip): number {
  const { pixelFormat, width, height, frames } = clip.header;
  const [lines, lineBytes] = frameLines(pixelFormat, width, height);
  let sent = 0;
  for (let i = 0; i < frames; i++) for (const [, n, , w] of changedRects(clip, i)) sent += n * w;
  return sent / (lines * lineBytes * frames);
}

/** Share of all frame lines that the clip sends to the display (0-1). */
export function linesSentFraction(clip: Rv565Clip): number {
  const { pixelFormat, width, height, frames } = clip.header;
  const lines = frameLines(pixelFormat, width, height)[0];
  let sent = 0;
  for (let i = 0; i < frames; i++) for (const [, n] of changedLines(clip, i)) sent += n;
  return sent / (lines * frames);
}

/** Frame i in the clip's pixel format (header.frameBytes bytes). Decoding in
 * order applies one record per frame; a seek starts at the keyframe at or
 * before i, at most K - 1 records back. Callers must not modify the result. */
export async function decodeFrame(clip: Rv565Clip, i: number): Promise<Uint8Array> {
  if (!(Number.isInteger(i) && i >= 0 && i < clip.header.frames)) throw new RangeError(`frame ${i} out of range`);
  if (clip.last?.i === i) return clip.last.frame;
  let start: number, frame: Uint8Array;
  if (clip.last?.i === i - 1) {
    start = i - 1;
    frame = clip.last.frame;
  } else {
    start = i;
    while (clip.index[start].type !== KEYFRAME) start--;
    frame = await body(clip, start);
  }
  for (let j = start + 1; j <= i; j++) {
    const type = clip.index[j].type;
    if (type === KEYFRAME) frame = await body(clip, j);
    else if (type === DELTA) frame = xor(frame, await body(clip, j));
    else if (type === PARTIAL) frame = await applyPartial(clip, j, frame);
    else if (type === REGION) frame = await applyRegion(clip, j, frame);
  }
  clip.last = { i, frame };
  return frame;
}

/** Decode every frame; throws Rv565Error on the first bad one. */
export async function verify(clip: Rv565Clip): Promise<number> {
  clip.last = undefined;
  for (let i = 0; i < clip.header.frames; i++) await decodeFrame(clip, i);
  return clip.header.frames;
}

export function frameTypeCounts(clip: Rv565Clip) {
  const counts = { key: 0, delta: 0, repeat: 0, partial: 0, region: 0 };
  for (const { type } of clip.index) counts[FRAME_TYPE_NAMES[type]]++;
  return counts;
}

/* Schedulability: the paper's pooled ESP32-S3 decode-cost model. ---------- */

export const COST_ESP32S3_180x135 = { interceptUs: 4858.0, slopeUsPerByte: 0.1515 };
/** Display transfer per frame for a 320x240 panel at 40 MHz SPI. */
export const TRANSFER_320x240_US = 31312.0;

export type ScheduleReport = { lateFrames: number; worstFrameUs: number; periodUs: number; maxPayload: number };

/** Predicted missed deadlines from the body sizes alone, as the reference
 * `Clip.check_schedule`. The model was fitted on rgb565be zlib keyframes;
 * repeats cost nothing to decode. */
export function checkSchedule(clip: Rv565Clip, overlap: boolean, transferUs = TRANSFER_320x240_US): ScheduleReport {
  const m = COST_ESP32S3_180x135;
  const periodUs = 1e6 / clip.header.fps;
  let lateFrames = 0, worstFrameUs = 0, maxPayload = 0;
  for (const { length } of clip.index) {
    const inflate = length ? m.interceptUs + m.slopeUsPerByte * length : 0;
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

/** Scrolling colour bars, identical to `rv565 testpattern` frames (RGB565 BE). */
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
