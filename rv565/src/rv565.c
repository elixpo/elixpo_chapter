#include "rv565.h"

#include <string.h>

#if RV565_BUNDLED_TINFL
#include "third_party/miniz_tinfl.h"
#else
#include "miniz.h" /* ESP32 ROM tinfl, from ESP-IDF's esp_rom component */
#endif

const rv565_cost_model_t RV565_COST_ESP32S3_180x135 = { 4858.0f, 0.1515f };

static uint16_t rd16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }

static uint32_t rd32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

const char *rv565_strerror(rv565_status_t status)
{
    switch (status) {
    case RV565_OK:            return "ok";
    case RV565_ERR_ARG:       return "invalid argument";
    case RV565_ERR_MAGIC:     return "not an RV565 file";
    case RV565_ERR_VERSION:   return "unsupported RV565 version";
    case RV565_ERR_HEADER:    return "invalid dimensions, rate or frame count";
    case RV565_ERR_TRUNCATED: return "truncated frame table";
    case RV565_ERR_TRAILING:  return "trailing bytes after the last frame";
    case RV565_ERR_INFLATE:   return "frame did not inflate to its RGB565 size";
    case RV565_ERR_RANGE:     return "frame index out of range";
    }
    return "unknown error";
}

rv565_status_t rv565_parse_header(const uint8_t *data, size_t size,
                                  uint16_t max_w, uint16_t max_h,
                                  rv565_header_t *out)
{
    if (data == NULL || out == NULL || size < RV565_HEADER_SIZE) {
        return RV565_ERR_ARG;
    }
    if (memcmp(data, "RV5", 3) != 0) {
        return RV565_ERR_MAGIC;
    }
    if (data[3] != RV565_CONTAINER_V6) {
        return RV565_ERR_VERSION;
    }
    out->width = rd16(data + 4);
    out->height = rd16(data + 6);
    out->fps = data[8];
    out->flags = data[9];
    out->frames = rd16(data + 10);
    if (out->width == 0 || out->height == 0 ||
            (max_w != 0 && out->width > max_w) ||
            (max_h != 0 && out->height > max_h) ||
            out->fps == 0 || out->fps > RV565_MAX_FPS || out->frames == 0) {
        return RV565_ERR_HEADER;
    }
    return RV565_OK;
}

rv565_status_t rv565_open(rv565_clip_t *clip, const uint8_t *data, size_t size,
                          uint32_t *index, size_t index_entries,
                          uint16_t max_w, uint16_t max_h)
{
    if (clip == NULL || index == NULL) {
        return RV565_ERR_ARG;
    }
    rv565_status_t status = rv565_parse_header(data, size, max_w, max_h, &clip->header);
    if (status != RV565_OK) {
        return status;
    }
    if (index_entries < clip->header.frames) {
        return RV565_ERR_ARG;
    }
    size_t cursor = RV565_HEADER_SIZE;
    for (uint16_t i = 0; i < clip->header.frames; ++i) {
        if (size - cursor < 4) {
            return RV565_ERR_TRUNCATED;
        }
        const uint32_t length = rd32(data + cursor);
        cursor += 4;
        if (length == 0 || size - cursor < length) {
            return RV565_ERR_TRUNCATED;
        }
        index[i] = (uint32_t)cursor;
        cursor += length;
    }
    if (cursor != size) {
        return RV565_ERR_TRAILING;
    }
    clip->data = data;
    clip->size = size;
    clip->index = index;
    return RV565_OK;
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
    *payload = clip->data + offset;
    *length = rd32(clip->data + offset - 4);
    return RV565_OK;
}

rv565_status_t rv565_inflate(const void *src, size_t src_len,
                             void *dst, size_t dst_len)
{
    if (src == NULL || dst == NULL || src_len == 0 || dst_len == 0) {
        return RV565_ERR_ARG;
    }
    /* tinfl keeps its ~11 KB decompressor on the caller's stack. */
    const size_t written = tinfl_decompress_mem_to_mem(
        dst, dst_len, src, src_len, TINFL_FLAG_PARSE_ZLIB_HEADER);
    return written == dst_len ? RV565_OK : RV565_ERR_INFLATE;
}

rv565_status_t rv565_decode_frame(const rv565_clip_t *clip, uint16_t i,
                                  uint8_t *dst, size_t dst_len)
{
    const uint8_t *payload;
    uint32_t length;
    rv565_status_t status = rv565_payload(clip, i, &payload, &length);
    if (status != RV565_OK) {
        return status;
    }
    if (dst_len != rv565_frame_bytes(&clip->header)) {
        return RV565_ERR_ARG;
    }
    return rv565_inflate(payload, length, dst, dst_len);
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
        const uint32_t length = rd32(clip->data + clip->index[i] - 4);
        const float inflate_us = rv565_predict_inflate_us(model, length);
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
