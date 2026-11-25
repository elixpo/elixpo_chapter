/* RV565: video for microcontroller displays, decoded straight into the
 * display's pixel format.
 *
 * Container version 7 (docs/FORMAT.md), all integers little-endian:
 *
 *   offset  size  field
 *   0       3     magic "RV5"
 *   3       1     version (7)
 *   4       2     width
 *   6       2     height
 *   8       1     frames per second (1-60)
 *   9       1     flags (0)
 *   10      2     frame count
 *   12      1     header size H (>= 16)
 *   13      1     pixel format (rv565_pixel_format_t)
 *   14      1     codec (rv565_codec_t: stored or zlib)
 *   15      1     keyframe interval K (>= 1)
 *   H       ...   per frame: u32 length L, u8 frame type, L-1 bytes of body
 *
 * Frames are keyframes, XOR deltas from the previous decoded frame, partial
 * deltas (the XOR of only the bands of lines that changed), or repeats of
 * it; every frame i with i % K == 0 is a keyframe, so seeking applies at most
 * K-1 records after a keyframe.
 *
 * Version 6 files (RV565 1.x) still open: H = 12, RGB565 big-endian, zlib,
 * K = 1, records without a type byte, 1-30 FPS.
 *
 * The core is allocation-free: callers supply the index table and buffers.
 */
#ifndef RV565_H
#define RV565_H

#include <stddef.h>
#include <stdint.h>

#include "rv565_config.h"

#ifdef __cplusplus
extern "C" {
#endif

#define RV565_VERSION_MAJOR 2
#define RV565_VERSION_MINOR 0
#define RV565_VERSION_PATCH 0

#define RV565_CONTAINER_V6     6
#define RV565_CONTAINER_V7     7
#define RV565_HEADER_SIZE_V6   12
#define RV565_HEADER_SIZE_V7   16  /* minimum; the header's own size field rules */
#define RV565_MAX_FPS          60  /* version 7 */
#define RV565_MAX_FPS_V6       30

typedef enum {
    RV565_OK              =  0,
    RV565_ERR_ARG         = -1,  /* NULL pointer, buffer too small, or missing scratch */
    RV565_ERR_MAGIC       = -2,  /* not an RV565 file */
    RV565_ERR_VERSION     = -3,  /* unsupported container version */
    RV565_ERR_HEADER      = -4,  /* dimensions, rate, frame count, header size or K out of range */
    RV565_ERR_TRUNCATED   = -5,  /* file or a record runs past the end of the data */
    RV565_ERR_TRAILING    = -6,  /* bytes left after the last frame */
    RV565_ERR_INFLATE     = -7,  /* zlib body did not inflate to exactly the frame size */
    RV565_ERR_RANGE       = -8,  /* frame index out of range */
    RV565_ERR_FORMAT      = -9,  /* reserved pixel format, codec or frame type */
    RV565_ERR_KEYFRAME    = -10, /* a frame at a multiple of K is not a keyframe */
    RV565_ERR_RECORD      = -11, /* repeat with a body, or stored body not frame-sized */
    RV565_ERR_UNSUPPORTED = -12, /* valid file this player or display cannot show */
    RV565_ERR_PARTIAL     = -13, /* partial delta: band height 0, short mask, no band or a band past the frame */
} rv565_status_t;

typedef enum {
    RV565_PIXEL_RGB565BE   = 0,  /* 2 bytes/pixel, high byte first (ST7789 over SPI) */
    RV565_PIXEL_RGB565LE   = 1,  /* 2 bytes/pixel, low byte first */
    RV565_PIXEL_RGB444     = 2,  /* 12-bit pixels packed, ceil(3w/2) bytes/row */
    RV565_PIXEL_RGB666     = 3,  /* 3 bytes/pixel, channel in the high 6 bits */
    RV565_PIXEL_RGB888     = 4,  /* 3 bytes/pixel */
    RV565_PIXEL_GRAY8      = 5,  /* 1 byte/pixel */
    RV565_PIXEL_GRAY4      = 6,  /* 2 pixels/byte, high nibble first */
    RV565_PIXEL_MONO       = 7,  /* 1 bit/pixel, MSB first, rows of ceil(w/8) bytes */
    RV565_PIXEL_MONO_VPAGE = 8,  /* SSD1306 pages: w bytes per 8 rows, LSB = top */
    RV565_PIXEL_FORMATS    = 9   /* count; values >= this are reserved */
} rv565_pixel_format_t;

typedef enum {
    RV565_CODEC_STORED = 0,  /* body is the frame bytes as they are */
    RV565_CODEC_ZLIB   = 1,  /* body is a zlib stream */
    RV565_CODECS       = 2
} rv565_codec_t;

typedef enum {
    RV565_FRAME_KEY    = 0,
    RV565_FRAME_DELTA  = 1,  /* body decodes to F[i] XOR F[i-1] */
    RV565_FRAME_REPEAT = 2,  /* no body; F[i] = F[i-1] */
    RV565_FRAME_PARTIAL = 3, /* band height, band mask, XOR of the changed bands */
    RV565_FRAME_TYPES  = 4
} rv565_frame_type_t;

typedef struct {
    uint16_t width;
    uint16_t height;
    uint8_t  fps;
    uint8_t  flags;
    uint16_t frames;
    uint8_t  version;            /* 6 or 7 */
    uint8_t  header_size;        /* offset of the first record (12 for version 6) */
    uint8_t  pixel_format;       /* rv565_pixel_format_t */
    uint8_t  codec;              /* rv565_codec_t */
    uint8_t  keyframe_interval;  /* K >= 1 */
} rv565_header_t;

typedef struct {
    rv565_header_t header;
    const uint8_t *data;     /* whole container, e.g. memory-mapped flash */
    size_t         size;
    /* index[i] = offset just past frame i's u32 length: the type byte in
     * version 7, the zlib body in version 6. */
    const uint32_t *index;
} rv565_clip_t;

/* Human-readable name for a status code. */
const char *rv565_strerror(rv565_status_t status);

/* Parse and range-check the header (version 6 or 7). Limits: width and
 * height 1..max_w/max_h (0 means no limit), fps 1..60 (1..30 in version 6),
 * frame count >= 1; in version 7 also H >= 16 (and within the data), a
 * defined pixel format and codec, and K >= 1. */
rv565_status_t rv565_parse_header(const uint8_t *data, size_t size,
                                  uint16_t max_w, uint16_t max_h,
                                  rv565_header_t *out);

/* Bytes in one row of `width` pixels; 0 for RV565_PIXEL_MONO_VPAGE (which
 * has pages, not rows) and for reserved formats. */
size_t rv565_row_bytes(uint8_t pixel_format, uint16_t width);

/* Bytes per pixel for byte-aligned formats (1, 2 or 3); 0 for the packed
 * formats rgb444, gray4, mono and mono_vpage, and for reserved formats. */
uint8_t rv565_bytes_per_pixel(uint8_t pixel_format);

/* Decoded size S of one frame in bytes, in the clip's pixel format
 * (mono_vpage: width * ceil(height / 8)). */
size_t rv565_frame_bytes(const rv565_header_t *h);

/* Line geometry for partial deltas and changed-line reports: a frame is
 * *lines lines of *line_bytes bytes (pixel rows for formats 0-7, pages of 8
 * rows for mono_vpage). */
void rv565_frame_lines(const rv565_header_t *h, uint16_t *lines, size_t *line_bytes);

/* Validate the complete container and build the frame index in one linear
 * scan: lengths nonzero and inside the data, no trailing bytes, and in
 * version 7 defined frame types, a keyframe at every multiple of K, repeats
 * without a body, stored bodies of exactly S bytes, and partial deltas with
 * a band height >= 1, a complete band mask with at least one band and none
 * past the frame, and (stored) exactly the changed bands' bytes. Whether
 * zlib data inflates to its size is checked when it is decoded. `index` must hold at
 * least header.frames entries. */
rv565_status_t rv565_open(rv565_clip_t *clip, const uint8_t *data, size_t size,
                          uint32_t *index, size_t index_entries,
                          uint16_t max_w, uint16_t max_h);

/* Type of frame i (rv565_frame_type_t, >= 0), or a negative rv565_status_t.
 * Every version 6 frame is a keyframe. */
int rv565_frame_type(const rv565_clip_t *clip, uint16_t i);

/* Latest keyframe at or before frame i (>= 0), or a negative rv565_status_t.
 * Looks back at most K-1 records. */
int32_t rv565_keyframe_at_or_before(const rv565_clip_t *clip, uint16_t i);

/* A run of lines a frame changes: lines first .. first + count - 1. */
typedef struct {
    uint16_t first;
    uint16_t count;
} rv565_line_run_t;

/* The lines frame i changes relative to frame i-1, without decoding: one run
 * of every line for a keyframe or delta, none for a repeat, and for a
 * partial delta its changed bands with adjacent bands merged. Writes up to
 * max_runs runs and sets *count to the total number of runs (which may be
 * larger; a partial delta has at most ceil(lines / 2) runs). Returns
 * RV565_ERR_ARG if runs is too small, after filling it. */
rv565_status_t rv565_changed_lines(const rv565_clip_t *clip, uint16_t i,
                                   rv565_line_run_t *runs, size_t max_runs,
                                   size_t *count);

/* The same for one partial delta body (frame type 3, type byte excluded) of a
 * frame of `lines` lines of `line_bytes` bytes, e.g. for a reader that parses
 * the container itself. Returns RV565_ERR_PARTIAL for an invalid body. */
rv565_status_t rv565_partial_runs(const uint8_t *body, uint32_t length,
                                  uint16_t lines, size_t line_bytes,
                                  rv565_line_run_t *runs, size_t max_runs, size_t *count);

/* Apply one partial delta body to a frame of `lines` lines of `line_bytes`
 * bytes, as rv565_decode() does for a partial frame: `prev` holds the
 * previous frame and is dst itself (in place: only the changed bands are
 * written; a zlib body needs scratch of at least the changed bands' size) or
 * does not overlap it (all of dst is written, no scratch). `codec` is
 * RV565_CODEC_STORED or RV565_CODEC_ZLIB. */
rv565_status_t rv565_apply_partial(const uint8_t *body, uint32_t length,
                                   uint16_t lines, size_t line_bytes, uint8_t codec,
                                   const uint8_t *prev, uint8_t *dst,
                                   uint8_t *scratch, size_t scratch_len);

/* Body pointer and length of frame i, in O(1): the encoded frame or delta,
 * the whole partial delta body (band height and mask included), or length 0
 * for a repeat. */
rv565_status_t rv565_payload(const rv565_clip_t *clip, uint16_t i,
                             const uint8_t **payload, uint32_t *length);

/* Inflate one zlib stream; succeeds only if it yields exactly dst_len bytes. */
rv565_status_t rv565_inflate(const void *src, size_t src_len,
                             void *dst, size_t dst_len);

/* Decode frame i into dst (dst_len == rv565_frame_bytes()).
 *
 * `prev` must hold decoded frame i-1 when frame i is a delta or a repeat (it
 * is ignored for a keyframe), and must either be dst itself or not overlap
 * it:
 *   - keyframe: decodes into dst;
 *   - repeat:   copies prev into dst (nothing when prev == dst);
 *   - delta:    with prev != dst, decodes into dst and XORs prev into it;
 *               in place (prev == dst), stored deltas XOR straight from the
 *               body, and zlib deltas need `scratch` of at least S bytes
 *               (RV565_ERR_ARG without it);
 *   - partial:  in place, XORs only the changed bands (a zlib partial needs
 *               `scratch` of at least the changed bands' size, at most S);
 *               with prev != dst, writes all of dst and needs no scratch.
 * Pass scratch = NULL, scratch_len = 0 when not decoding zlib deltas in place. */
rv565_status_t rv565_decode(const rv565_clip_t *clip, uint16_t i,
                            const uint8_t *prev, uint8_t *dst, size_t dst_len,
                            uint8_t *scratch, size_t scratch_len);

/* In-place sequential convenience: rv565_decode(clip, i, dst, dst, dst_len,
 * NULL, 0). Frame i decodes on its own when it is a keyframe (every frame of
 * a version 6 file); otherwise dst must hold frame i-1, and a zlib delta
 * returns RV565_ERR_ARG (use rv565_decode with a scratch buffer). */
rv565_status_t rv565_decode_frame(const rv565_clip_t *clip, uint16_t i,
                                  uint8_t *dst, size_t dst_len);

/* Random access: decode the keyframe at or before i into dst and apply the
 * records up to i, in place. A scratch buffer of S bytes is needed only if a
 * zlib delta or partial delta lies on that path. */
rv565_status_t rv565_seek(const rv565_clip_t *clip, uint16_t i,
                          uint8_t *dst, size_t dst_len,
                          uint8_t *scratch, size_t scratch_len);

/* Nearest-neighbour scaling ---------------------------------------------- */

/* map[x] = source column for destination column x (dst_w entries). The same
 * function builds the row map with heights. */
void rv565_build_map(uint16_t *map, uint16_t src_len, uint16_t dst_len);

/* Scale `rows` destination rows starting at `first_row` into `stripe`,
 * which holds rows * dst_w * 2 bytes, for 2-byte formats (rgb565be and
 * rgb565le). Pixel bytes are copied as they are. */
void rv565_scale_stripe(const uint8_t *frame, uint16_t src_w,
                        const uint16_t *xmap, uint16_t dst_w,
                        const uint16_t *ymap, uint16_t first_row,
                        uint16_t rows, uint8_t *stripe);

/* The same for any byte-aligned format: `bpp` is rv565_bytes_per_pixel()
 * (1, 2 or 3) and the stripe holds rows * dst_w * bpp bytes. Packed formats
 * (rgb444, gray4, mono, mono_vpage) are not scaled; returns RV565_ERR_ARG for
 * any other bpp. */
rv565_status_t rv565_scale_stripe_bpp(const uint8_t *frame, uint16_t src_w, uint8_t bpp,
                                      const uint16_t *xmap, uint16_t dst_w,
                                      const uint16_t *ymap, uint16_t first_row,
                                      uint16_t rows, uint8_t *stripe);

/* Decode-cost model and schedulability ----------------------------------- */

/* T_inflate(L) = intercept_us + slope_us_per_byte * L. */
typedef struct {
    float intercept_us;
    float slope_us_per_byte;
} rv565_cost_model_t;

/* Pooled fit from the RV565 paper (arXiv:2610.35935): ESP32-S3 at 240 MHz,
 * ROM tinfl, 180x135 frames decoded into internal SRAM. Refit for other
 * chips, clocks or frame sizes with the paper's analysis script. */
extern const rv565_cost_model_t RV565_COST_ESP32S3_180x135;

/* Pooled fit on a Raspberry Pi Pico 2: RP2350 at 150 MHz, bundled tinfl, clip
 * read through the XIP flash cache, 180x135 frames decoded into SRAM, serial
 * path. With dual-core decoding, core-1 inflation measured 1.2-1.4 ms slower
 * (the cores contend). See docs/RESULTS_RP2350.md. */
extern const rv565_cost_model_t RV565_COST_RP2350_180x135;

static inline float rv565_predict_inflate_us(const rv565_cost_model_t *m,
                                             uint32_t payload_len)
{
    return m->intercept_us + m->slope_us_per_byte * (float)payload_len;
}

typedef struct {
    uint16_t late_frames;      /* frames predicted to miss the period */
    uint32_t max_payload;      /* largest body in the clip (type byte excluded) */
    float    worst_frame_us;   /* predicted worst-case frame work */
    float    period_us;        /* 1e6 / fps */
} rv565_schedule_report_t;

/* Predict deadline misses from container metadata alone. `transfer_us` is
 * the measured display transfer time per frame. With overlap, inflation of
 * the next frame runs on another core during the transfer, so frame work is
 * max(transfer, inflate); otherwise it is transfer + inflate. The model is
 * applied to each body length; repeats cost no decode. (A delta's XOR pass
 * and stored copies are not modelled, as in the Python package.) */
rv565_status_t rv565_check_schedule(const rv565_clip_t *clip,
                                    const rv565_cost_model_t *model,
                                    float transfer_us, int overlap,
                                    rv565_schedule_report_t *report);

/* Absolute-deadline pacing ----------------------------------------------- */

typedef struct {
    uint32_t period_us;
    uint32_t deadline_us;  /* presentation deadline of the next frame */
    uint16_t frame;        /* next source frame to present */
    uint16_t frames;
} rv565_pacer_t;

void rv565_pacer_start(rv565_pacer_t *p, const rv565_header_t *h, uint32_t now_us);

/* Call after presenting p->frame. Advances to the next frame; if more than one
 * period late, skips frames until the deadline is in the future again.
 * Skipped frames are never displayed; rv565_player_present() decodes the
 * ones a delta chain needs (at most K-1 records after a keyframe). Returns
 * the number of skipped frames and sets *wait_us to the time left before the
 * next deadline (0 if late). */
uint16_t rv565_pacer_advance(rv565_pacer_t *p, uint32_t now_us, uint32_t *wait_us);

#ifdef __cplusplus
}
#endif

#endif /* RV565_H */
