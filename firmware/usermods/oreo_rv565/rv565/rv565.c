#include "rv565.h"

#include <string.h>

#if RV565_BUNDLED_TINFL
#include "third_party/miniz_tinfl.h"
#else
#include "miniz.h" /* ESP32 ROM tinfl, from ESP-IDF's esp_rom component */
#endif

const rv565_cost_model_t RV565_COST_ESP32S3_180x135 = { 4858.0f, 0.1515f };
const rv565_cost_model_t RV565_COST_RP2350_180x135 = { 8108.1f, 0.2446f };

static uint16_t rd16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }

static uint32_t rd32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

const char *rv565_strerror(rv565_status_t status)
{
    switch (status) {
    case RV565_OK:              return "ok";
    case RV565_ERR_ARG:         return "invalid argument";
    case RV565_ERR_MAGIC:       return "not an RV565 file";
    case RV565_ERR_VERSION:     return "unsupported RV565 version";
    case RV565_ERR_HEADER:      return "invalid dimensions, rate, frame count, header size or keyframe interval";
    case RV565_ERR_TRUNCATED:   return "truncated file or frame record";
    case RV565_ERR_TRAILING:    return "trailing bytes after the last frame";
    case RV565_ERR_INFLATE:     return "frame did not inflate to its frame size";
    case RV565_ERR_RANGE:       return "frame index out of range";
    case RV565_ERR_FORMAT:      return "reserved pixel format, codec or frame type";
    case RV565_ERR_KEYFRAME:    return "missing keyframe at the keyframe interval";
    case RV565_ERR_RECORD:      return "repeat frame with a body, or stored frame of the wrong size";
    case RV565_ERR_UNSUPPORTED: return "pixel format not supported by this player";
    case RV565_ERR_PARTIAL:     return "invalid partial delta band height or band mask";
    }
    return "unknown error";
}

rv565_status_t rv565_parse_header(const uint8_t *data, size_t size,
                                  uint16_t max_w, uint16_t max_h,
                                  rv565_header_t *out)
{
    if (data == NULL || out == NULL) {
        return RV565_ERR_ARG;
    }
    if (size < RV565_HEADER_SIZE_V6) {
        return RV565_ERR_TRUNCATED;
    }
    if (memcmp(data, "RV5", 3) != 0) {
        return RV565_ERR_MAGIC;
    }
    const uint8_t version = data[3];
    if (version != RV565_CONTAINER_V6 && version != RV565_CONTAINER_V7) {
        return RV565_ERR_VERSION;
    }
    out->width = rd16(data + 4);
    out->height = rd16(data + 6);
    out->fps = data[8];
    out->flags = data[9];
    out->frames = rd16(data + 10);
    out->version = version;
    if (version == RV565_CONTAINER_V6) {
        out->header_size = RV565_HEADER_SIZE_V6;
        out->pixel_format = RV565_PIXEL_RGB565BE;
        out->codec = RV565_CODEC_ZLIB;
        out->keyframe_interval = 1;
    } else {
        if (size < RV565_HEADER_SIZE_V7) {
            return RV565_ERR_TRUNCATED;
        }
        out->header_size = data[12];
        out->pixel_format = data[13];
        out->codec = data[14];
        out->keyframe_interval = data[15];
    }
    const uint8_t max_fps = version == RV565_CONTAINER_V6 ? RV565_MAX_FPS_V6 : RV565_MAX_FPS;
    if (out->width == 0 || out->height == 0 ||
            (max_w != 0 && out->width > max_w) ||
            (max_h != 0 && out->height > max_h) ||
            out->fps == 0 || out->fps > max_fps || out->frames == 0) {
        return RV565_ERR_HEADER;
    }
    if (version == RV565_CONTAINER_V7) {
        if (out->header_size < RV565_HEADER_SIZE_V7 || size < out->header_size) {
            return RV565_ERR_HEADER;
        }
        if (out->pixel_format >= RV565_PIXEL_FORMATS || out->codec >= RV565_CODECS) {
            return RV565_ERR_FORMAT;
        }
        if (out->keyframe_interval == 0) {
            return RV565_ERR_HEADER;
        }
    }
    return RV565_OK;
}

size_t rv565_row_bytes(uint8_t pixel_format, uint16_t width)
{
    const size_t w = width;
    switch (pixel_format) {
    case RV565_PIXEL_RGB565BE:
    case RV565_PIXEL_RGB565LE: return 2u * w;
    case RV565_PIXEL_RGB444:   return (3u * w + 1u) / 2u;
    case RV565_PIXEL_RGB666:
    case RV565_PIXEL_RGB888:   return 3u * w;
    case RV565_PIXEL_GRAY8:    return w;
    case RV565_PIXEL_GRAY4:    return (w + 1u) / 2u;
    case RV565_PIXEL_MONO:     return (w + 7u) / 8u;
    default:                   return 0;  /* mono_vpage has pages; reserved */
    }
}

uint8_t rv565_bytes_per_pixel(uint8_t pixel_format)
{
    switch (pixel_format) {
    case RV565_PIXEL_RGB565BE:
    case RV565_PIXEL_RGB565LE: return 2;
    case RV565_PIXEL_RGB666:
    case RV565_PIXEL_RGB888:   return 3;
    case RV565_PIXEL_GRAY8:    return 1;
    default:                   return 0;
    }
}

size_t rv565_frame_bytes(const rv565_header_t *h)
{
    if (h->pixel_format == RV565_PIXEL_MONO_VPAGE) {
        return (size_t)h->width * (((size_t)h->height + 7u) / 8u);
    }
    return rv565_row_bytes(h->pixel_format, h->width) * h->height;
}

void rv565_frame_lines(const rv565_header_t *h, uint16_t *lines, size_t *line_bytes)
{
    if (h->pixel_format == RV565_PIXEL_MONO_VPAGE) {
        *lines = (uint16_t)(((uint32_t)h->height + 7u) / 8u);
        *line_bytes = h->width;
    } else {
        *lines = h->height;
        *line_bytes = rv565_row_bytes(h->pixel_format, h->width);
    }
}

/* A partial delta body, parsed. */
typedef struct {
    uint16_t lines;        /* P */
    size_t line_bytes;     /* R */
    uint8_t band;          /* B */
    uint32_t bands;        /* N = ceil(P / B) */
    uint32_t changed;      /* bands set in the mask */
    const uint8_t *mask;
    const uint8_t *shifts; /* (dx, dy) signed bytes per changed band */
    const uint8_t *data;   /* codec-encoded residuals of the changed bands */
    uint32_t data_len;
    size_t size;           /* decoded size of the changed bands together */
} partial_t;

static int band_changed(const partial_t *p, uint32_t b)
{
    return (p->mask[b >> 3] >> (b & 7u)) & 1u;
}

/* Lines [*first, *end) of band b. */
static void band_lines(const partial_t *p, uint32_t b, uint32_t *first, uint32_t *end)
{
    *first = b * p->band;
    *end = *first + p->band < p->lines ? *first + p->band : p->lines;
}

static rv565_status_t partial_parse(uint16_t lines, size_t line_bytes, const uint8_t *body,
                                    uint32_t length, partial_t *p)
{
    p->lines = lines;
    p->line_bytes = line_bytes;
    if (body == NULL || lines == 0 || line_bytes == 0) {
        return RV565_ERR_ARG;
    }
    if (length < 1 || body[0] == 0) {
        return RV565_ERR_PARTIAL;
    }
    p->band = body[0];
    p->bands = ((uint32_t)p->lines + p->band - 1u) / p->band;
    const uint32_t mask_len = (p->bands + 7u) / 8u;
    if (length - 1u < mask_len) {
        return RV565_ERR_PARTIAL;
    }
    p->mask = body + 1;
    if ((p->bands & 7u) != 0 && (p->mask[mask_len - 1] >> (p->bands & 7u)) != 0) {
        return RV565_ERR_PARTIAL;  /* a band past the frame */
    }
    p->changed = 0;
    p->size = 0;
    for (uint32_t b = 0; b < p->bands; ++b) {
        if (band_changed(p, b)) {
            uint32_t first, end;
            band_lines(p, b, &first, &end);
            p->size += (size_t)(end - first) * p->line_bytes;
            ++p->changed;
        }
    }
    if (p->changed == 0 || length - 1u - mask_len < 2u * p->changed) {
        return RV565_ERR_PARTIAL;  /* no band, or too short for the shifts */
    }
    p->shifts = body + 1 + mask_len;
    for (uint32_t k = 0; k < p->changed; ++k) {
        const int dy = (int8_t)p->shifts[2 * k + 1];
        if (dy >= (int)p->band || -dy >= (int)p->band) {
            return RV565_ERR_PARTIAL;  /* the shift leaves the band */
        }
    }
    p->data = p->shifts + 2u * p->changed;
    p->data_len = length - 1u - mask_len - 2u * p->changed;
    return RV565_OK;
}

rv565_status_t rv565_open(rv565_clip_t *clip, const uint8_t *data, size_t size,
                          uint32_t *index, size_t index_entries,
                          uint16_t max_w, uint16_t max_h)
{
    if (clip == NULL || index == NULL) {
        return RV565_ERR_ARG;
    }
    rv565_header_t h;
    rv565_status_t status = rv565_parse_header(data, size, max_w, max_h, &h);
    if (status != RV565_OK) {
        return status;
    }
    if (index_entries < h.frames) {
        return RV565_ERR_ARG;
    }
    const int v7 = h.version == RV565_CONTAINER_V7;
    const size_t frame_bytes = rv565_frame_bytes(&h);
    size_t cursor = h.header_size;
    for (uint32_t i = 0; i < h.frames; ++i) {
        if (size - cursor < 4) {
            return RV565_ERR_TRUNCATED;
        }
        const uint32_t length = rd32(data + cursor);
        cursor += 4;
        if (length == 0 || size - cursor < length) {
            return RV565_ERR_TRUNCATED;
        }
        if (v7) {
            const uint8_t type = data[cursor];
            if (type >= RV565_FRAME_TYPES) {
                return RV565_ERR_FORMAT;
            }
            if (i % h.keyframe_interval == 0 && type != RV565_FRAME_KEY) {
                return RV565_ERR_KEYFRAME;
            }
            if (type == RV565_FRAME_REPEAT) {
                if (length != 1) {
                    return RV565_ERR_RECORD;
                }
            } else if (type == RV565_FRAME_PARTIAL) {
                partial_t p;
                uint16_t lines;
                size_t line_bytes;
                rv565_frame_lines(&h, &lines, &line_bytes);
                status = partial_parse(lines, line_bytes, data + cursor + 1, length - 1u, &p);
                if (status != RV565_OK) {
                    return status;
                }
                if (h.codec == RV565_CODEC_STORED && p.data_len != p.size) {
                    return RV565_ERR_RECORD;
                }
            } else if (h.codec == RV565_CODEC_STORED && length - 1u != frame_bytes) {
                return RV565_ERR_RECORD;
            }
        }
        index[i] = (uint32_t)cursor;
        cursor += length;
    }
    if (cursor != size) {
        return RV565_ERR_TRAILING;
    }
    clip->header = h;
    clip->data = data;
    clip->size = size;
    clip->index = index;
    return RV565_OK;
}

int rv565_frame_type(const rv565_clip_t *clip, uint16_t i)
{
    if (clip == NULL) {
        return RV565_ERR_ARG;
    }
    if (i >= clip->header.frames) {
        return RV565_ERR_RANGE;
    }
    if (clip->header.version == RV565_CONTAINER_V6) {
        return RV565_FRAME_KEY;
    }
    return clip->data[clip->index[i]];
}

int32_t rv565_keyframe_at_or_before(const rv565_clip_t *clip, uint16_t i)
{
    int type = rv565_frame_type(clip, i);
    if (type < 0) {
        return type;
    }
    /* The interval guarantees a keyframe at i - (i mod K). */
    while (type != RV565_FRAME_KEY) {
        type = rv565_frame_type(clip, --i);
    }
    return i;
}

rv565_status_t rv565_partial_runs(const uint8_t *body, uint32_t length,
                                  uint16_t lines, size_t line_bytes,
                                  rv565_line_run_t *runs, size_t max_runs, size_t *count)
{
    if (count == NULL || (runs == NULL && max_runs != 0)) {
        return RV565_ERR_ARG;
    }
    *count = 0;
    partial_t p;
    const rv565_status_t status = partial_parse(lines, line_bytes, body, length, &p);
    if (status != RV565_OK) {
        return status;
    }
    size_t n = 0;
    uint32_t run_first = 0, run_end = 0;  /* current run; empty while equal */
    for (uint32_t b = 0; b < p.bands; ++b) {
        if (!band_changed(&p, b)) {
            continue;
        }
        uint32_t first, end;
        band_lines(&p, b, &first, &end);
        if (run_end != run_first && run_end == first) {
            run_end = end;
            continue;
        }
        if (run_end != run_first) {
            if (n < max_runs) {
                runs[n].first = (uint16_t)run_first;
                runs[n].count = (uint16_t)(run_end - run_first);
            }
            ++n;
        }
        run_first = first;
        run_end = end;
    }
    if (n < max_runs) {
        runs[n].first = (uint16_t)run_first;
        runs[n].count = (uint16_t)(run_end - run_first);
    }
    ++n;
    *count = n;
    return n <= max_runs ? RV565_OK : RV565_ERR_ARG;
}

rv565_status_t rv565_changed_lines(const rv565_clip_t *clip, uint16_t i,
                                   rv565_line_run_t *runs, size_t max_runs,
                                   size_t *count)
{
    if (count == NULL || (runs == NULL && max_runs != 0)) {
        return RV565_ERR_ARG;
    }
    *count = 0;
    const int type = rv565_frame_type(clip, i);
    if (type < 0) {
        return (rv565_status_t)type;
    }
    if (type == RV565_FRAME_REPEAT) {
        return RV565_OK;
    }
    size_t n = 0;
    if (type != RV565_FRAME_PARTIAL) {
        uint16_t lines;
        size_t line_bytes;
        rv565_frame_lines(&clip->header, &lines, &line_bytes);
        if (max_runs > 0) {
            runs[0].first = 0;
            runs[0].count = lines;
        }
        n = 1;
    } else {
        const uint8_t *body;
        uint32_t length;
        uint16_t lines;
        size_t line_bytes;
        rv565_payload(clip, i, &body, &length);
        rv565_frame_lines(&clip->header, &lines, &line_bytes);
        return rv565_partial_runs(body, length, lines, line_bytes, runs, max_runs, count);
    }
    *count = n;
    return n <= max_runs ? RV565_OK : RV565_ERR_ARG;
}

rv565_status_t rv565_payload(const rv565_clip_t *clip, uint16_t i,
                             const uint8_t **payload, uint32_t *length)
{
    if (clip == NULL || payload == NULL || length == NULL) {
        return RV565_ERR_ARG;
    }
    if (i >= clip->header.frames) {
        return RV565_ERR_RANGE;
    }
    const uint32_t offset = clip->index[i];
    const uint32_t record = rd32(clip->data + offset - 4);
    if (clip->header.version == RV565_CONTAINER_V6) {
        *payload = clip->data + offset;
        *length = record;
    } else {
        *payload = clip->data + offset + 1;
        *length = record - 1u;
    }
    return RV565_OK;
}

rv565_status_t rv565_inflate(const void *src, size_t src_len,
                             void *dst, size_t dst_len)
{
    if (src == NULL || dst == NULL || src_len == 0 || dst_len == 0) {
        return RV565_ERR_ARG;
    }
#if RV565_BUNDLED_TINFL
    /* The ~11 KB decompressor is static, not on the stack: the RP2040/RP2350
     * core 0 stack is 2 KB, and a stack copy overflowed it in serial mode.
     * Callers inflate one frame at a time (the player uses one core for it). */
    static tinfl_decompressor decomp;
    size_t in_len = src_len;
    size_t out_len = dst_len;
    tinfl_init(&decomp);
    const tinfl_status status = tinfl_decompress(
        &decomp, (const mz_uint8 *)src, &in_len, (mz_uint8 *)dst, (mz_uint8 *)dst,
        &out_len, TINFL_FLAG_PARSE_ZLIB_HEADER | TINFL_FLAG_USING_NON_WRAPPING_OUTPUT_BUF);
    return (status == TINFL_STATUS_DONE && out_len == dst_len) ? RV565_OK : RV565_ERR_INFLATE;
#else
    /* The ESP32 ROM tinfl keeps its ~11 KB decompressor on the caller's stack. */
    const size_t written = tinfl_decompress_mem_to_mem(
        dst, dst_len, src, src_len, TINFL_FLAG_PARSE_ZLIB_HEADER);
    return written == dst_len ? RV565_OK : RV565_ERR_INFLATE;
#endif
}

/* dst[k] = a[k] ^ b[k]; dst may be a or b. Word-wide when all three are
 * aligned (frame buffers usually are), bytewise otherwise. */
#if defined(__GNUC__)
typedef uint32_t __attribute__((may_alias)) xor_word_t;
#endif

static void xor_bytes(uint8_t *dst, const uint8_t *a, const uint8_t *b, size_t n)
{
    size_t k = 0;
#if defined(__GNUC__)
    if ((((uintptr_t)dst | (uintptr_t)a | (uintptr_t)b) & 3u) == 0) {
        xor_word_t *d32 = (xor_word_t *)(void *)dst;
        const xor_word_t *a32 = (const xor_word_t *)(const void *)a;
        const xor_word_t *b32 = (const xor_word_t *)(const void *)b;
        for (size_t w = n / 4u; w != 0; --w) {
            *d32++ = *a32++ ^ *b32++;
        }
        k = n & ~(size_t)3u;
    }
#endif
    for (; k < n; ++k) {
        dst[k] = a[k] ^ b[k];
    }
}

/* Decode a keyframe or delta body into dst (no XOR). */
static rv565_status_t decode_body(const rv565_clip_t *clip, const uint8_t *body,
                                  uint32_t length, uint8_t *dst, size_t dst_len)
{
    if (clip->header.codec == RV565_CODEC_STORED) {
        memcpy(dst, body, dst_len);  /* rv565_open checked length == dst_len */
        return RV565_OK;
    }
    if (length == 0) {
        return RV565_ERR_INFLATE;  /* an empty zlib body inflates to nothing */
    }
    return rv565_inflate(body, length, dst, dst_len);
}

/* out ^= src shifted right by dx bytes (left for dx < 0); bytes shifted in
 * from outside the line predict 0. out and src are different lines. */
static void xor_shifted(uint8_t *out, const uint8_t *src, size_t r, int dx)
{
    if (dx >= 0 && (size_t)dx < r) {
        xor_bytes(out + dx, out + dx, src, r - (size_t)dx);
    } else if (dx < 0 && (size_t)-dx < r) {
        xor_bytes(out, out, src - dx, r - (size_t)-dx);
    }
}

/* Shift one line in place by dx bytes, filling with 0. */
static void shift_line(uint8_t *line, size_t r, int dx)
{
    const size_t m = (size_t)(dx < 0 ? -dx : dx);
    if (m >= r) {
        memset(line, 0, r);
    } else if (dx > 0) {
        memmove(line + m, line, r - m);
        memset(line, 0, m);
    } else if (dx < 0) {
        memmove(line, line + m, r - m);
        memset(line + r - m, 0, m);
    }
}

/* Build one changed band: line y = prediction XOR residual, where the
 * prediction is line y - dy of `src` shifted by dx bytes, or 0 where that
 * leaves the band or the line. `out` and `src` are the band in dst and in the
 * previous frame (the same memory in place); `res` holds the band's residual
 * lines and lies elsewhere, or at or below `out` (zlib between two buffers):
 * then lines are visited last to first, and since a residual line and its
 * output line are a whole number of lines apart, each residual line is read
 * before anything overwrites it. In place, lines are visited so that each prediction is read before its
 * line is rewritten, so no copy of the band is needed. */
static void build_band(uint8_t *out, const uint8_t *src, const uint8_t *res,
                       uint32_t nlines, size_t r, int dx, int dy)
{
    const int in_place = out == src;
    if (dx == 0 && dy == 0) {
        if (in_place) {
            xor_bytes(out, out, res, nlines * r);
        } else {
            for (uint32_t k = nlines; k-- > 0;) {
                xor_bytes(out + k * r, src + k * r, res + k * r, r);
            }
        }
        return;
    }
    /* Descending unless an in-place band predicts from the lines below. */
    const int ascending = in_place && dy < 0;
    for (uint32_t k = 0; k < nlines; ++k) {
        const uint32_t y = ascending ? k : nlines - 1u - k;
        uint8_t *line = out + (size_t)y * r;
        const uint8_t *residual = res + (size_t)y * r;
        const int32_t sy = (int32_t)y - dy;
        if (in_place && dy == 0) {
            shift_line(line, r, dx);
            xor_bytes(line, line, residual, r);
            continue;
        }
        if (line != residual) {
            memmove(line, residual, r);
        }
        if (sy >= 0 && sy < (int32_t)nlines) {
            xor_shifted(line, src + (size_t)sy * r, r, dx);
        }
    }
}

rv565_status_t rv565_apply_partial(const uint8_t *body, uint32_t length,
                                   uint16_t lines, size_t line_bytes, uint8_t codec,
                                   const uint8_t *prev, uint8_t *dst,
                                   uint8_t *scratch, size_t scratch_len)
{
    partial_t p;
    if (prev == NULL || dst == NULL || codec >= RV565_CODECS) {
        return RV565_ERR_ARG;
    }
    rv565_status_t status = partial_parse(lines, line_bytes, body, length, &p);
    if (status != RV565_OK) {
        return status;
    }
    const int zlib = codec == RV565_CODEC_ZLIB;
    if (!zlib && p.data_len != p.size) {
        return RV565_ERR_RECORD;
    }
    if (zlib && p.data_len == 0) {
        return RV565_ERR_INFLATE;
    }
    const uint8_t *res = p.data;
    if (prev == dst) {
        /* In place: only the changed bands are touched. */
        if (zlib) {
            if (scratch == NULL || scratch_len < p.size) {
                return RV565_ERR_ARG;
            }
            status = rv565_inflate(p.data, p.data_len, scratch, p.size);
            if (status != RV565_OK) {
                return status;
            }
            res = scratch;
        }
    } else if (zlib) {
        /* Two buffers: inflate the residuals to the start of dst; bands are
         * then built from the last back, and band b's residual sits at or
         * below its own offset, so it is read before it is overwritten. */
        status = rv565_inflate(p.data, p.data_len, dst, p.size);
        if (status != RV565_OK) {
            return status;
        }
        res = dst;
    }
    const size_t r = p.line_bytes;
    size_t pos = p.size;
    uint32_t k = p.changed;
    for (uint32_t b = p.bands; b-- > 0;) {
        uint32_t first, end;
        band_lines(&p, b, &first, &end);
        const size_t lo = (size_t)first * r, n = (size_t)(end - first) * r;
        if (band_changed(&p, b)) {
            --k;
            pos -= n;
            build_band(dst + lo, prev + lo, res + pos, end - first, r,
                       (int8_t)p.shifts[2 * k], (int8_t)p.shifts[2 * k + 1]);
        } else if (prev != dst) {
            memcpy(dst + lo, prev + lo, n);
        }
    }
    return RV565_OK;
}

rv565_status_t rv565_decode(const rv565_clip_t *clip, uint16_t i,
                            const uint8_t *prev, uint8_t *dst, size_t dst_len,
                            uint8_t *scratch, size_t scratch_len)
{
    const uint8_t *body;
    uint32_t length;
    rv565_status_t status = rv565_payload(clip, i, &body, &length);
    if (status != RV565_OK) {
        return status;
    }
    if (dst == NULL || dst_len != rv565_frame_bytes(&clip->header)) {
        return RV565_ERR_ARG;
    }
    const int type = rv565_frame_type(clip, i);
    if (type == RV565_FRAME_KEY) {
        return decode_body(clip, body, length, dst, dst_len);
    }
    if (prev == NULL) {
        return RV565_ERR_ARG;
    }
    if (type == RV565_FRAME_REPEAT) {
        if (prev != dst) {
            memcpy(dst, prev, dst_len);
        }
        return RV565_OK;
    }
    if (type == RV565_FRAME_PARTIAL) {
        uint16_t lines;
        size_t line_bytes;
        rv565_frame_lines(&clip->header, &lines, &line_bytes);
        return rv565_apply_partial(body, length, lines, line_bytes, clip->header.codec,
                                   prev, dst, scratch, scratch_len);
    }
    /* Delta. */
    if (clip->header.codec == RV565_CODEC_STORED) {
        xor_bytes(dst, prev, body, dst_len);
        return RV565_OK;
    }
    if (length == 0) {
        return RV565_ERR_INFLATE;
    }
    if (prev != dst) {
        status = rv565_inflate(body, length, dst, dst_len);
        if (status == RV565_OK) {
            xor_bytes(dst, dst, prev, dst_len);
        }
        return status;
    }
    if (scratch == NULL || scratch_len < dst_len) {
        return RV565_ERR_ARG;
    }
    status = rv565_inflate(body, length, scratch, dst_len);
    if (status == RV565_OK) {
        xor_bytes(dst, dst, scratch, dst_len);
    }
    return status;
}

rv565_status_t rv565_decode_frame(const rv565_clip_t *clip, uint16_t i,
                                  uint8_t *dst, size_t dst_len)
{
    return rv565_decode(clip, i, dst, dst, dst_len, NULL, 0);
}

rv565_status_t rv565_seek(const rv565_clip_t *clip, uint16_t i,
                          uint8_t *dst, size_t dst_len,
                          uint8_t *scratch, size_t scratch_len)
{
    const int32_t key = rv565_keyframe_at_or_before(clip, i);
    if (key < 0) {
        return (rv565_status_t)key;
    }
    for (uint32_t j = (uint32_t)key; j <= i; ++j) {
        const rv565_status_t status =
            rv565_decode(clip, (uint16_t)j, dst, dst, dst_len, scratch, scratch_len);
        if (status != RV565_OK) {
            return status;
        }
    }
    return RV565_OK;
}

void rv565_build_map(uint16_t *map, uint16_t src_len, uint16_t dst_len)
{
    for (uint32_t d = 0; d < dst_len; ++d) {
        map[d] = (uint16_t)((d * src_len) / dst_len);
    }
}

void rv565_scale_stripe(const uint8_t *frame, uint16_t src_w,
                        const uint16_t *xmap, uint16_t dst_w,
                        const uint16_t *ymap, uint16_t first_row,
                        uint16_t rows, uint8_t *stripe)
{
    for (uint16_t r = 0; r < rows; ++r) {
        const uint8_t *src = frame + (size_t)ymap[first_row + r] * src_w * 2u;
        uint8_t *dst = stripe + (size_t)r * dst_w * 2u;
        for (uint16_t x = 0; x < dst_w; ++x) {
            const uint8_t *px = src + (size_t)xmap[x] * 2u;
            *dst++ = px[0];
            *dst++ = px[1];
        }
    }
}

rv565_status_t rv565_scale_stripe_bpp(const uint8_t *frame, uint16_t src_w, uint8_t bpp,
                                      const uint16_t *xmap, uint16_t dst_w,
                                      const uint16_t *ymap, uint16_t first_row,
                                      uint16_t rows, uint8_t *stripe)
{
    if (bpp == 2) {
        rv565_scale_stripe(frame, src_w, xmap, dst_w, ymap, first_row, rows, stripe);
        return RV565_OK;
    }
    if (bpp != 1 && bpp != 3) {
        return RV565_ERR_ARG;
    }
    for (uint16_t r = 0; r < rows; ++r) {
        const uint8_t *src = frame + (size_t)ymap[first_row + r] * src_w * bpp;
        uint8_t *dst = stripe + (size_t)r * dst_w * bpp;
        if (bpp == 1) {
            for (uint16_t x = 0; x < dst_w; ++x) {
                *dst++ = src[xmap[x]];
            }
        } else {
            for (uint16_t x = 0; x < dst_w; ++x) {
                const uint8_t *px = src + (size_t)xmap[x] * 3u;
                *dst++ = px[0];
                *dst++ = px[1];
                *dst++ = px[2];
            }
        }
    }
    return RV565_OK;
}

rv565_status_t rv565_check_schedule(const rv565_clip_t *clip,
                                    const rv565_cost_model_t *model,
                                    float transfer_us, int overlap,
                                    rv565_schedule_report_t *report)
{
    if (clip == NULL || model == NULL || report == NULL) {
        return RV565_ERR_ARG;
    }
    memset(report, 0, sizeof(*report));
    report->period_us = 1e6f / (float)clip->header.fps;
    for (uint16_t i = 0; i < clip->header.frames; ++i) {
        const uint8_t *body;
        uint32_t length;
        rv565_payload(clip, i, &body, &length);
        const float inflate_us = length != 0 ? rv565_predict_inflate_us(model, length) : 0.0f;
        const float work_us = overlap
            ? (inflate_us > transfer_us ? inflate_us : transfer_us)
            : inflate_us + transfer_us;
        if (length > report->max_payload) {
            report->max_payload = length;
        }
        if (work_us > report->worst_frame_us) {
            report->worst_frame_us = work_us;
        }
        if (work_us > report->period_us) {
            ++report->late_frames;
        }
    }
    return RV565_OK;
}

void rv565_pacer_start(rv565_pacer_t *p, const rv565_header_t *h, uint32_t now_us)
{
    p->period_us = 1000000u / h->fps;
    p->deadline_us = now_us;
    p->frame = 0;
    p->frames = h->frames;
}

uint16_t rv565_pacer_advance(rv565_pacer_t *p, uint32_t now_us, uint32_t *wait_us)
{
    uint16_t skipped = 0;
    p->frame = (uint16_t)((p->frame + 1) % p->frames);
    p->deadline_us += p->period_us;
    /* Signed differences keep the arithmetic correct across timer wrap. */
    while ((int32_t)(now_us - (p->deadline_us + p->period_us)) > 0) {
        p->frame = (uint16_t)((p->frame + 1) % p->frames);
        p->deadline_us += p->period_us;
        ++skipped;
    }
    const int32_t remaining = (int32_t)(p->deadline_us - now_us);
    if (wait_us != NULL) {
        *wait_us = remaining > 0 ? (uint32_t)remaining : 0u;
    }
    return skipped;
}
