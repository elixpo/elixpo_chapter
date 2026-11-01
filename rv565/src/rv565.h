/* RV565: frame-independent RGB565 video for microcontrollers.
 *
 * Container (version 6), all integers little-endian:
 *
 *   offset  size  field
 *   0       3     magic "RV5"
 *   3       1     version (6)
 *   4       2     width
 *   6       2     height
 *   8       1     frames per second (1-30)
 *   9       1     flags (0)
 *   10      2     frame count
 *   12      ...   per frame: u32 compressed length, zlib payload
 *
 * Each payload inflates to exactly width * height * 2 bytes of RGB565 in
 * big-endian byte order, the order SPI panels such as the ST7789 expect.
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

#define RV565_VERSION_MAJOR 1
#define RV565_VERSION_MINOR 1
#define RV565_VERSION_PATCH 0

#define RV565_HEADER_SIZE      12
#define RV565_CONTAINER_V6     6
#define RV565_MAX_FPS          30

typedef enum {
    RV565_OK              =  0,
    RV565_ERR_ARG         = -1,  /* NULL pointer or buffer too small */
    RV565_ERR_MAGIC       = -2,  /* not an RV565 file */
    RV565_ERR_VERSION     = -3,  /* unsupported container version */
    RV565_ERR_HEADER      = -4,  /* dimensions, rate or frame count out of range */
    RV565_ERR_TRUNCATED   = -5,  /* length table runs past the end of the data */
    RV565_ERR_TRAILING    = -6,  /* bytes left after the last frame */
    RV565_ERR_INFLATE     = -7,  /* payload did not inflate to exactly 2*w*h bytes */
    RV565_ERR_RANGE       = -8,  /* frame index out of range */
} rv565_status_t;

typedef struct {
    uint16_t width;
    uint16_t height;
    uint8_t  fps;
    uint8_t  flags;
    uint16_t frames;
} rv565_header_t;

typedef struct {
    rv565_header_t header;
    const uint8_t *data;     /* whole container, e.g. memory-mapped flash */
    size_t         size;
    const uint32_t *index;   /* index[i] = offset of frame i's payload */
} rv565_clip_t;

/* Human-readable name for a status code. */
const char *rv565_strerror(rv565_status_t status);

/* Parse and range-check the 12-byte header. Limits: width and height
 * 1..max_w/max_h (0 means no limit), fps 1..30, frame count >= 1. */
rv565_status_t rv565_parse_header(const uint8_t *data, size_t size,
                                  uint16_t max_w, uint16_t max_h,
                                  rv565_header_t *out);

/* Decoded size of one frame in bytes (2 * width * height). */
static inline size_t rv565_frame_bytes(const rv565_header_t *h)
{
    return (size_t)h->width * h->height * 2u;
}

/* Validate the complete container and build the frame index in one linear
 * scan: every length must be nonzero and inside the data, and no bytes may
 * follow the last frame. `index` must hold at least header.frames entries. */
rv565_status_t rv565_open(rv565_clip_t *clip, const uint8_t *data, size_t size,
                          uint32_t *index, size_t index_entries,
                          uint16_t max_w, uint16_t max_h);

/* Payload pointer and length for frame i, in O(1). */
rv565_status_t rv565_payload(const rv565_clip_t *clip, uint16_t i,
                             const uint8_t **payload, uint32_t *length);

/* Inflate one zlib payload; succeeds only if it yields exactly dst_len bytes. */
rv565_status_t rv565_inflate(const void *src, size_t src_len,
                             void *dst, size_t dst_len);

/* Inflate frame i of an open clip into dst (dst_len == frame bytes). */
rv565_status_t rv565_decode_frame(const rv565_clip_t *clip, uint16_t i,
                                  uint8_t *dst, size_t dst_len);

/* Nearest-neighbour scaling ---------------------------------------------- */

/* map[x] = source column for destination column x (dst_w entries). The same
 * function builds the row map with heights. */
void rv565_build_map(uint16_t *map, uint16_t src_len, uint16_t dst_len);

/* Scale `rows` destination rows starting at `first_row` into `stripe`,
 * which holds rows * dst_w * 2 bytes. Pixels keep their big-endian order. */
void rv565_scale_stripe(const uint8_t *frame, uint16_t src_w,
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

static inline float rv565_predict_inflate_us(const rv565_cost_model_t *m,
                                             uint32_t payload_len)
{
    return m->intercept_us + m->slope_us_per_byte * (float)payload_len;
}

typedef struct {
    uint16_t late_frames;      /* frames predicted to miss the period */
    uint32_t max_payload;      /* largest payload in the clip */
    float    worst_frame_us;   /* predicted worst-case frame work */
    float    period_us;        /* 1e6 / fps */
} rv565_schedule_report_t;

/* Predict deadline misses from container metadata alone. `transfer_us` is
 * the measured display transfer time per frame. With overlap, inflation of
 * the next frame runs on another core during the transfer, so frame work is
 * max(transfer, inflate); otherwise it is transfer + inflate. */
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
 * period late, skips frames (never decodes them) until the deadline is in the
 * future again. Returns the number of skipped frames and sets *wait_us to the
 * time left before the next deadline (0 if late). */
uint16_t rv565_pacer_advance(rv565_pacer_t *p, uint32_t now_us, uint32_t *wait_us);

#ifdef __cplusplus
}
#endif

#endif /* RV565_H */
