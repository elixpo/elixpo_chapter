#include "rv565_player.h"

#include <string.h>

rv565_status_t rv565_player_init(rv565_player_t *p)
{
    if (p == NULL || p->clip == NULL || p->micros == NULL ||
            p->display.begin_frame == NULL || p->display.queue_stripe == NULL ||
            p->display.wait_stripe == NULL || p->display.end_frame == NULL ||
            p->stripes[0] == NULL || p->stripes[1] == NULL || p->frames[0] == NULL ||
            p->xmap == NULL || p->ymap == NULL || p->stripe_rows == 0 ||
            p->panel_width == 0 || p->panel_height == 0) {
        return RV565_ERR_ARG;
    }
    if (p->decoder.start != NULL && (p->decoder.finish == NULL || p->frames[1] == NULL)) {
        return RV565_ERR_ARG;
    }
    rv565_build_map(p->xmap, p->clip->header.width, p->panel_width);
    rv565_build_map(p->ymap, p->clip->header.height, p->panel_height);
    p->current = 0;
    p->ready_frame = -1;
    p->ready_inflate_us = 0;
    return RV565_OK;
}

/* Scale and transfer one decoded frame through the two stripes. Scaling of
 * stripe n+1 overlaps the DMA transfer of stripe n. */
static void send_frame(rv565_player_t *p, const uint8_t *frame, rv565_frame_stats_t *s)
{
    const rv565_header_t *h = &p->clip->header;
    const size_t stripe_row_bytes = (size_t)p->panel_width * 2u;
    const uint32_t start = p->micros();

    p->display.begin_frame(p->display.ctx);
    int current = 0;
    uint16_t row = 0;
    uint16_t rows = p->stripe_rows < p->panel_height ? p->stripe_rows : p->panel_height;

    uint32_t t = p->micros();
    rv565_scale_stripe(frame, h->width, p->xmap, p->panel_width, p->ymap, row, rows, p->stripes[current]);
    s->scale_us += p->micros() - t;

    while (row < p->panel_height) {
        p->display.queue_stripe(p->display.ctx, p->stripes[current], rows * stripe_row_bytes);
        const uint16_t next_row = (uint16_t)(row + rows);
        const uint16_t left = (uint16_t)(p->panel_height - next_row);
        const uint16_t next_rows = next_row < p->panel_height
            ? (left < p->stripe_rows ? left : p->stripe_rows) : 0;
        if (next_rows != 0) {
            t = p->micros();
            rv565_scale_stripe(frame, h->width, p->xmap, p->panel_width, p->ymap,
                               next_row, next_rows, p->stripes[current ^ 1]);
            s->scale_us += p->micros() - t;
        }
        t = p->micros();
        p->display.wait_stripe(p->display.ctx);
        s->wait_us += p->micros() - t;
        row = next_row;
        rows = next_rows;
        current ^= 1;
    }
    p->display.end_frame(p->display.ctx);
    s->transfer_us = p->micros() - start;
}

rv565_status_t rv565_player_present(rv565_player_t *p, uint16_t index,
                                    rv565_frame_stats_t *stats)
{
    rv565_frame_stats_t local;
    rv565_frame_stats_t *s = stats != NULL ? stats : &local;
    memset(s, 0, sizeof(*s));
    if (index >= p->clip->header.frames) {
        return RV565_ERR_RANGE;
    }
    const size_t frame_bytes = rv565_frame_bytes(&p->clip->header);
    const uint32_t work_start = p->micros();
    rv565_status_t status;

    if (p->decoder.start == NULL) {
        /* Serial path: inflate, then transfer. */
        status = rv565_decode_frame(p->clip, index, p->frames[0], frame_bytes);
        if (status != RV565_OK) {
            return status;
        }
        s->inflate_us = p->micros() - work_start;
        send_frame(p, p->frames[0], s);
    } else {
        /* Dual-core path. The frame is normally inflated already, during the
         * previous transfer; after a skip the prefetch is stale and the frame
         * is inflated here, on the critical path. */
        if (p->ready_frame != (int32_t)index) {
            p->decoder.start(p->decoder.ctx, index, p->frames[p->current], frame_bytes);
            status = p->decoder.finish(p->decoder.ctx, &p->ready_inflate_us);
            if (status != RV565_OK) {
                return status;
            }
        }
        s->inflate_us = p->ready_inflate_us;

        const uint16_t next = (uint16_t)((index + 1u) % p->clip->header.frames);
        const int other = p->current ^ 1;
        p->decoder.start(p->decoder.ctx, next, p->frames[other], frame_bytes);
        send_frame(p, p->frames[p->current], s);
        status = p->decoder.finish(p->decoder.ctx, &p->ready_inflate_us);
        if (status != RV565_OK) {
            p->ready_frame = -1;
            return status;
        }
        p->current = other;
        p->ready_frame = next;
    }
    s->work_us = p->micros() - work_start;
    return RV565_OK;
}
