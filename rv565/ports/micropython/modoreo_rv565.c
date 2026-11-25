// Firmware-resident RV565 frame decoding for FaleraOS on ESP32-S3.
//
// The Python side parses the container (version 6, 7 or 8, see docs/FORMAT.md)
// and hands each frame body to this module, which decodes it into a reused
// frame buffer without allocating a Python bytes object or running Deflate or
// the XOR pass through the MicroPython layer. The ESP32-S3 ROM already
// contains miniz's tinfl, which inflates zlib bodies.
//
//   inflate_frame(body, frame)            keyframe: frame = inflate(body)
//   inflate_delta(body, prev, frame[, scratch])
//                                         delta: frame = prev XOR inflate(body);
//                                         in place (prev is frame) needs a
//                                         scratch buffer of len(frame) bytes
//   xor_frame(frame, other)               frame ^= other (stored deltas)
//   apply_partial(body, frame, line_bytes, zlib[, scratch])
//                                         partial delta (frame type 3), in
//                                         place: frame's changed bands become
//                                         their shifted prediction XOR the
//                                         residual; a zlib body needs a scratch
//                                         buffer (len(frame) bytes is always
//                                         enough). Returns the changed line
//                                         runs as a list of (first, count), to
//                                         send only those rows to the display.
//   apply_region(body, frame, line_bytes, pixel_format, zlib[, scratch])
//                                         region delta (frame type 4, format
//                                         version 8), in place: within each
//                                         changed band's byte range, frame
//                                         becomes the shifted prediction XOR
//                                         the residual; the rest is unchanged.
//                                         pixel_format is the header's byte
//                                         (0-8). Scratch as for apply_partial.
//                                         Returns the changed rectangles as a
//                                         list of (first line, line count,
//                                         first byte, byte count), one per
//                                         band, each one display window.
//
// A repeat frame needs nothing: the previous frame is already decoded.
// Every function raises ValueError unless the body inflates to exactly
// len(frame) bytes and the buffers have that length.

#include <stddef.h>
#include <stdint.h>

#include "py/runtime.h"
#include "py/obj.h"
#include "miniz.h"
#include "rv565.h"

static void inflate_exact(const mp_buffer_info_t *src, void *dst, size_t len) {
    if (src->len == 0 || len == 0) {
        mp_raise_ValueError(MP_ERROR_TEXT("empty RV565 frame buffer"));
    }
    const size_t written = tinfl_decompress_mem_to_mem(
        dst, len, src->buf, src->len, TINFL_FLAG_PARSE_ZLIB_HEADER);
    if (written != len) {
        mp_raise_ValueError(MP_ERROR_TEXT("invalid RV565 frame"));
    }
}

typedef uint32_t __attribute__((may_alias)) xor_word_t;

static void xor_into(uint8_t *dst, const uint8_t *src, size_t len) {
    size_t k = 0;
    if ((((uintptr_t)dst | (uintptr_t)src) & 3u) == 0) {
        xor_word_t *d32 = (xor_word_t *)(void *)dst;
        const xor_word_t *s32 = (const xor_word_t *)(const void *)src;
        for (size_t w = len / 4u; w != 0; --w) {
            *d32++ ^= *s32++;
        }
        k = len & ~(size_t)3u;
    }
    for (; k < len; ++k) {
        dst[k] ^= src[k];
    }
}

static mp_obj_t oreo_rv565_inflate_frame(mp_obj_t source_obj,
                                          mp_obj_t destination_obj) {
    mp_buffer_info_t source;
    mp_buffer_info_t destination;
    mp_get_buffer_raise(source_obj, &source, MP_BUFFER_READ);
    mp_get_buffer_raise(destination_obj, &destination, MP_BUFFER_WRITE);
    inflate_exact(&source, destination.buf, destination.len);
    return mp_obj_new_int_from_uint(destination.len);
}
static MP_DEFINE_CONST_FUN_OBJ_2(
    oreo_rv565_inflate_frame_obj,
    oreo_rv565_inflate_frame
);

static mp_obj_t oreo_rv565_inflate_delta(size_t n_args, const mp_obj_t *args) {
    mp_buffer_info_t source, prev, frame;
    mp_get_buffer_raise(args[0], &source, MP_BUFFER_READ);
    mp_get_buffer_raise(args[1], &prev, MP_BUFFER_READ);
    mp_get_buffer_raise(args[2], &frame, MP_BUFFER_WRITE);
    if (prev.len != frame.len) {
        mp_raise_ValueError(MP_ERROR_TEXT("RV565 frame sizes differ"));
    }
    if (prev.buf != frame.buf) {
        inflate_exact(&source, frame.buf, frame.len);
        xor_into(frame.buf, prev.buf, frame.len);
    } else {
        mp_buffer_info_t scratch;
        if (n_args < 4) {
            mp_raise_ValueError(MP_ERROR_TEXT("in-place RV565 delta needs a scratch buffer"));
        }
        mp_get_buffer_raise(args[3], &scratch, MP_BUFFER_WRITE);
        if (scratch.len < frame.len) {
            mp_raise_ValueError(MP_ERROR_TEXT("RV565 scratch buffer too small"));
        }
        inflate_exact(&source, scratch.buf, frame.len);
        xor_into(frame.buf, scratch.buf, frame.len);
    }
    return mp_obj_new_int_from_uint(frame.len);
}
static MP_DEFINE_CONST_FUN_OBJ_VAR_BETWEEN(
    oreo_rv565_inflate_delta_obj, 3, 4,
    oreo_rv565_inflate_delta
);

static mp_obj_t oreo_rv565_xor_frame(mp_obj_t frame_obj, mp_obj_t other_obj) {
    mp_buffer_info_t frame, other;
    mp_get_buffer_raise(frame_obj, &frame, MP_BUFFER_WRITE);
    mp_get_buffer_raise(other_obj, &other, MP_BUFFER_READ);
    if (frame.len != other.len) {
        mp_raise_ValueError(MP_ERROR_TEXT("RV565 frame sizes differ"));
    }
    xor_into(frame.buf, other.buf, frame.len);
    return mp_obj_new_int_from_uint(frame.len);
}
static MP_DEFINE_CONST_FUN_OBJ_2(
    oreo_rv565_xor_frame_obj,
    oreo_rv565_xor_frame
);

static mp_obj_t oreo_rv565_apply_partial(size_t n_args, const mp_obj_t *args) {
    mp_buffer_info_t body, frame, scratch = {0};
    mp_get_buffer_raise(args[0], &body, MP_BUFFER_READ);
    mp_get_buffer_raise(args[1], &frame, MP_BUFFER_WRITE);
    const mp_int_t line_bytes = mp_obj_get_int(args[2]);
    const int zlib = mp_obj_is_true(args[3]);
    if (n_args > 4) {
        mp_get_buffer_raise(args[4], &scratch, MP_BUFFER_WRITE);
    }
    if (line_bytes <= 0 || frame.len % (size_t)line_bytes != 0 ||
            frame.len / (size_t)line_bytes > 0xFFFF) {
        mp_raise_ValueError(MP_ERROR_TEXT("RV565 frame is not whole lines"));
    }
    const uint16_t lines = (uint16_t)(frame.len / (size_t)line_bytes);
    rv565_status_t st = rv565_apply_partial(
        body.buf, (uint32_t)body.len, lines, (size_t)line_bytes,
        zlib ? RV565_CODEC_ZLIB : RV565_CODEC_STORED,
        frame.buf, frame.buf, scratch.buf, scratch.len);
    if (st != RV565_OK) {
        mp_raise_ValueError(st == RV565_ERR_ARG
            ? MP_ERROR_TEXT("RV565 partial delta needs a scratch buffer")
            : MP_ERROR_TEXT("invalid RV565 partial delta"));
    }
    /* The changed runs: count them, then fill a temporary array. */
    size_t count = 0;
    rv565_partial_runs(body.buf, (uint32_t)body.len, lines, (size_t)line_bytes, NULL, 0, &count);
    rv565_line_run_t *runs = m_new(rv565_line_run_t, count);
    rv565_partial_runs(body.buf, (uint32_t)body.len, lines, (size_t)line_bytes, runs, count, &count);
    mp_obj_t list = mp_obj_new_list(0, NULL);
    for (size_t k = 0; k < count; ++k) {
        mp_obj_t pair[2] = {
            MP_OBJ_NEW_SMALL_INT(runs[k].first),
            MP_OBJ_NEW_SMALL_INT(runs[k].count),
        };
        mp_obj_list_append(list, mp_obj_new_tuple(2, pair));
    }
    m_del(rv565_line_run_t, runs, count);
    return list;
}
static MP_DEFINE_CONST_FUN_OBJ_VAR_BETWEEN(
    oreo_rv565_apply_partial_obj, 4, 5,
    oreo_rv565_apply_partial
);

static mp_obj_t oreo_rv565_apply_region(size_t n_args, const mp_obj_t *args) {
    mp_buffer_info_t body, frame, scratch = {0};
    mp_get_buffer_raise(args[0], &body, MP_BUFFER_READ);
    mp_get_buffer_raise(args[1], &frame, MP_BUFFER_WRITE);
    const mp_int_t line_bytes = mp_obj_get_int(args[2]);
    const mp_int_t pixel_format = mp_obj_get_int(args[3]);
    const int zlib = mp_obj_is_true(args[4]);
    if (n_args > 5) {
        mp_get_buffer_raise(args[5], &scratch, MP_BUFFER_WRITE);
    }
    if (line_bytes <= 0 || frame.len % (size_t)line_bytes != 0 ||
            frame.len / (size_t)line_bytes > 0xFFFF) {
        mp_raise_ValueError(MP_ERROR_TEXT("RV565 frame is not whole lines"));
    }
    if (pixel_format < 0 || pixel_format >= RV565_PIXEL_FORMATS) {
        mp_raise_ValueError(MP_ERROR_TEXT("unsupported RV565 pixel format"));
    }
    const uint16_t lines = (uint16_t)(frame.len / (size_t)line_bytes);
    rv565_status_t st = rv565_apply_region(
        body.buf, (uint32_t)body.len, lines, (size_t)line_bytes, (uint8_t)pixel_format,
        zlib ? RV565_CODEC_ZLIB : RV565_CODEC_STORED,
        frame.buf, frame.buf, scratch.buf, scratch.len);
    if (st != RV565_OK) {
        mp_raise_ValueError(st == RV565_ERR_ARG
            ? MP_ERROR_TEXT("RV565 region delta needs a scratch buffer")
            : MP_ERROR_TEXT("invalid RV565 region delta"));
    }
    /* One rectangle per changed band: count them, then fill a temporary array. */
    size_t count = 0;
    rv565_region_rects(body.buf, (uint32_t)body.len, lines, (size_t)line_bytes,
                       (uint8_t)pixel_format, NULL, 0, &count);
    rv565_rect_t *rects = m_new(rv565_rect_t, count);
    rv565_region_rects(body.buf, (uint32_t)body.len, lines, (size_t)line_bytes,
                       (uint8_t)pixel_format, rects, count, &count);
    mp_obj_t list = mp_obj_new_list(0, NULL);
    for (size_t k = 0; k < count; ++k) {
        mp_obj_t rect[4] = {
            MP_OBJ_NEW_SMALL_INT(rects[k].first),
            MP_OBJ_NEW_SMALL_INT(rects[k].count),
            mp_obj_new_int_from_uint(rects[k].x0),
            mp_obj_new_int_from_uint(rects[k].xw),
        };
        mp_obj_list_append(list, mp_obj_new_tuple(4, rect));
    }
    m_del(rv565_rect_t, rects, count);
    return list;
}
static MP_DEFINE_CONST_FUN_OBJ_VAR_BETWEEN(
    oreo_rv565_apply_region_obj, 5, 6,
    oreo_rv565_apply_region
);

static const mp_rom_map_elem_t oreo_rv565_module_globals_table[] = {
    {MP_ROM_QSTR(MP_QSTR___name__), MP_ROM_QSTR(MP_QSTR__oreo_rv565)},
    {MP_ROM_QSTR(MP_QSTR_FORMAT_VERSION), MP_ROM_INT(8)},
    {MP_ROM_QSTR(MP_QSTR_inflate_frame),
     MP_ROM_PTR(&oreo_rv565_inflate_frame_obj)},
    {MP_ROM_QSTR(MP_QSTR_inflate_delta),
     MP_ROM_PTR(&oreo_rv565_inflate_delta_obj)},
    {MP_ROM_QSTR(MP_QSTR_xor_frame),
     MP_ROM_PTR(&oreo_rv565_xor_frame_obj)},
    {MP_ROM_QSTR(MP_QSTR_apply_partial),
     MP_ROM_PTR(&oreo_rv565_apply_partial_obj)},
    {MP_ROM_QSTR(MP_QSTR_apply_region),
     MP_ROM_PTR(&oreo_rv565_apply_region_obj)},
};
static MP_DEFINE_CONST_DICT(
    oreo_rv565_module_globals,
    oreo_rv565_module_globals_table
);

const mp_obj_module_t oreo_rv565_module = {
    .base = {&mp_type_module},
    .globals = (mp_obj_dict_t *)&oreo_rv565_module_globals,
};

MP_REGISTER_MODULE(MP_QSTR__oreo_rv565, oreo_rv565_module);
