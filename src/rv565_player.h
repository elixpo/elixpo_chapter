/* RV565 player: the paper's stripe pipeline, independent of any platform.
 *
 * Per frame the player scales the decoded frame into two alternating
 * stripes and hands them to the display driver, so stripe n+1 is scaled
 * while stripe n is transferred by DMA. With a decoder backend, the next
 * frame is inflated on another core during that transfer (dual-core
 * overlap); without one, frames are inflated inline (serial path).
 *
 * Platform ports (port/esp32, port/rp2) implement the two ops tables.
 */
#ifndef RV565_PLAYER_H
#define RV565_PLAYER_H

#include "rv565.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Display driver. At most two stripes are queued at once. */
typedef struct {
    void *ctx;
    /* Start a full-screen write (address window and RAMWR). */
    void (*begin_frame)(void *ctx);
    /* Queue one stripe for DMA; may return before the transfer ends. */
    void (*queue_stripe)(void *ctx, const uint8_t *data, size_t length);
    /* Block until the oldest queued stripe has been transferred. */
    void (*wait_stripe)(void *ctx);
    /* Finish the write (release chip select). */
    void (*end_frame)(void *ctx);
} rv565_display_ops_t;

/* Optional decoder backend that inflates on another core. */
typedef struct {
    void *ctx;
    /* Begin inflating frame `index` into `dst` asynchronously. */
    void (*start)(void *ctx, uint16_t index, uint8_t *dst, size_t dst_len);
    /* Wait for the started frame; reports its inflate time. */
    rv565_status_t (*finish)(void *ctx, uint32_t *inflate_us);
} rv565_decoder_ops_t;

typedef struct {
    uint32_t inflate_us;  /* inflate time of the presented frame */
    uint32_t scale_us;    /* cumulative stripe scaling */
    uint32_t wait_us;     /* cumulative wait for DMA */
    uint32_t transfer_us; /* whole display write */
    uint32_t work_us;     /* frame work on the critical path */
} rv565_frame_stats_t;

typedef struct {
    /* Configuration: fill before rv565_player_init(). */
    const rv565_clip_t *clip;
    uint16_t panel_width;
    uint16_t panel_height;
    uint16_t stripe_rows;           /* rows per stripe, e.g. 24 */
    uint8_t *stripes[2];            /* DMA-capable, panel_width*stripe_rows*2 each */
    uint8_t *frames[2];             /* decoded frames; frames[1] only for overlap */
    uint16_t *xmap;                 /* panel_width entries */
    uint16_t *ymap;                 /* panel_height entries */
    rv565_display_ops_t display;
    rv565_decoder_ops_t decoder;    /* start == NULL selects the serial path */
    uint32_t (*micros)(void);       /* monotonic microsecond clock */

    /* State. */
    int current;
    int32_t ready_frame;
    uint32_t ready_inflate_us;
} rv565_player_t;

/* Validate the configuration and build the scaling maps. */
rv565_status_t rv565_player_init(rv565_player_t *p);

/* Present one source frame and, with a decoder backend, prefetch the next. */
rv565_status_t rv565_player_present(rv565_player_t *p, uint16_t index,
                                    rv565_frame_stats_t *stats);

#ifdef __cplusplus
}
#endif

#endif /* RV565_PLAYER_H */
