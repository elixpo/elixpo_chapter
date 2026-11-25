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
    const rv565_header_t *h = &p->clip->header;
    if (h->pixel_format != RV565_PIXEL_RGB565BE) {
        return RV565_ERR_UNSUPPORTED;
    }
    if (p->decoder.start != NULL && (p->decoder.finish == NULL || p->frames[1] == NULL)) {
        return RV565_ERR_ARG;
    }
    /* With one buffer, deltas decode in place, which a zlib delta can only
     * do through a scratch buffer as large as a second frame. */
    if (p->frames[1] == NULL && h->codec == RV565_CODEC_ZLIB) {
        for (uint16_t i = 0; i < h->frames; ++i) {
            const int type = rv565_frame_type(p->clip, i);
            if (type == RV565_FRAME_DELTA || type == RV565_FRAME_PARTIAL ||
                    type == RV565_FRAME_REGION) {
                return RV565_ERR_ARG;
            }
        }
    }
    rv565_build_map(p->xmap, h->width, p->panel_width);
    rv565_build_map(p->ymap, h->height, p->panel_height);
    p->current = 0;
    p->held[0] = p->held[1] = -1;
    p->shown = -1;
    p->ready_inflate_us = 0;
    return RV565_OK;
}

/* Scale and transfer panel columns [x, x + cols) of rows [first_row,
 * first_row + count) of one decoded frame through the two stripes. Scaling of
 * stripe n+1 overlaps the DMA transfer of stripe n. A narrow window fits more
 * rows in a stripe. */
static void send_window(rv565_player_t *p, const uint8_t *frame, uint16_t x, uint16_t cols,
                        uint16_t first_row, uint16_t count, rv565_frame_stats_t *s)
{
    const rv565_header_t *h = &p->clip->header;
    const size_t stripe_row_bytes = (size_t)cols * 2u;
    const uint32_t start = p->micros();
    const uint16_t end_row = (uint16_t)(first_row + count);
    const uint32_t fit = (uint32_t)p->stripe_rows * p->panel_width / cols;
    const uint16_t stripe_rows = (uint16_t)(fit < count ? fit : count);
    const uint16_t *xmap = p->xmap + x;

    if (cols == p->panel_width && first_row == 0 && count == p->panel_height) {
        p->display.begin_frame(p->display.ctx);
    } else if (cols == p->panel_width && p->display.begin_rows != NULL) {
        p->display.begin_rows(p->display.ctx, first_row, count);
    } else {
        p->display.begin_window(p->display.ctx, x, first_row, cols, count);
    }
    int current = 0;
    uint16_t row = first_row;
    uint16_t rows = stripe_rows;

    uint32_t t = p->micros();
    rv565_scale_stripe(frame, h->width, xmap, cols, p->ymap, row, rows, p->stripes[current]);
    s->scale_us += p->micros() - t;

    while (row < end_row) {
        p->display.queue_stripe(p->display.ctx, p->stripes[current], rows * stripe_row_bytes);
        const uint16_t next_row = (uint16_t)(row + rows);
        const uint16_t left = (uint16_t)(end_row - next_row);
        const uint16_t next_rows = next_row < end_row
            ? (left < stripe_rows ? left : stripe_rows) : 0;
        if (next_rows != 0) {
            t = p->micros();
            rv565_scale_stripe(frame, h->width, xmap, cols, p->ymap,
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
    s->transfer_us += p->micros() - start;
    s->rows_sent = (uint16_t)(s->rows_sent + count);
    s->pixels_sent += (uint32_t)count * cols;
}

static void send_rows(rv565_player_t *p, const uint8_t *frame, uint16_t first_row,
                      uint16_t count, rv565_frame_stats_t *s)
{
    send_window(p, frame, 0, p->panel_width, first_row, count, s);
}

/* First index whose map entry is >= v (len if none); maps are nondecreasing. */
static uint16_t first_at_least(const uint16_t *map, uint16_t len, uint32_t v)
{
    uint16_t lo = 0, hi = len;
    while (lo < hi) {
        const uint16_t mid = (uint16_t)((lo + hi) / 2u);
        if (map[mid] < v) {
            lo = (uint16_t)(mid + 1u);
        } else {
            hi = mid;
        }
    }
    return lo;
}

/* First panel row whose source line is >= line (panel_height if none). */
static uint16_t row_for_line(const rv565_player_t *p, uint32_t line)
{
    return first_at_least(p->ymap, p->panel_height, line);
}

/* Region delta shown right after the frame on the panel: send each changed
 * band's range as one window of panel columns and rows; bands whose windows
 * have the same columns and touch merge. Returns 0 (nothing sent) when the
 * frame has more bands than RV565_PLAYER_MAX_RECTS. */
static int present_region(rv565_player_t *p, uint16_t index, const uint8_t *frame,
                          rv565_frame_stats_t *s)
{
    const rv565_header_t *h = &p->clip->header;
    rv565_rect_t rects[RV565_PLAYER_MAX_RECTS];
    size_t count;
    if (rv565_changed_rects(p->clip, index, rects, RV565_PLAYER_MAX_RECTS, &count) != RV565_OK) {
        return 0;
    }
    uint16_t pend_x0 = 0, pend_x1 = 0, pend_first = 0, pend_end = 0;
    for (size_t r = 0; r <= count; ++r) {
        uint16_t x0 = 0, x1 = 0, d0 = 0, d1 = 0;
        if (r < count) {
            uint16_t c0, nc;
            if (rv565_byte_columns(h->pixel_format, h->width, rects[r].x0, rects[r].xw,
                                   &c0, &nc) != RV565_OK) {
                return 0;  /* not reached: rv565_open validated the ranges */
            }
            x0 = first_at_least(p->xmap, p->panel_width, c0);
            x1 = first_at_least(p->xmap, p->panel_width, (uint32_t)c0 + nc);
            d0 = row_for_line(p, rects[r].first);
            d1 = row_for_line(p, (uint32_t)rects[r].first + rects[r].count);
            if (x0 == x1 || d0 == d1) {
                continue;  /* scaled away */
            }
            if (pend_end != pend_first && pend_end == d0 && pend_x0 == x0 && pend_x1 == x1) {
                pend_end = d1;
                continue;
            }
        }
        if (pend_end != pend_first) {
            send_window(p, frame, pend_x0, (uint16_t)(pend_x1 - pend_x0), pend_first,
                        (uint16_t)(pend_end - pend_first), s);
        }
        pend_x0 = x0;
        pend_x1 = x1;
        pend_first = d0;
        pend_end = d1;
    }
    return 1;
}

/* Source lines that differ between the frame on the panel (p->shown) and
 * frame `index`, as at most RV565_PLAYER_MAX_RUNS runs. Returns 0 when the
 * whole frame must be sent, 1 otherwise (*count may be 0: nothing changed). */
static int changed_since_shown(const rv565_player_t *p, uint16_t index,
                               rv565_line_run_t *runs, size_t *count)
{
    *count = 0;
    if (p->shown < 0 || p->shown > (int32_t)index ||
            (int32_t)index - p->shown > RV565_PLAYER_MAX_CATCHUP) {
        return 0;
    }
    if ((int32_t)index == p->shown) {
        return 1;
    }
    if ((int32_t)index == p->shown + 1) {
        return rv565_changed_lines(p->clip, index, runs, RV565_PLAYER_MAX_RUNS, count) == RV565_OK;
    }
    /* Several records since the panel was drawn: send the envelope of all
     * their changes (a superset of the lines that differ). */
    uint32_t first = UINT32_MAX, end = 0;
    for (uint32_t j = (uint32_t)p->shown + 1u; j <= index; ++j) {
        size_t n;
        if (rv565_changed_lines(p->clip, (uint16_t)j, runs, RV565_PLAYER_MAX_RUNS, &n) != RV565_OK) {
            return 0;
        }
        if (n != 0) {
            if (runs[0].first < first) first = runs[0].first;
            if ((uint32_t)runs[n - 1].first + runs[n - 1].count > end) {
                end = (uint32_t)runs[n - 1].first + runs[n - 1].count;
            }
        }
    }
    if (end != 0) {
        runs[0].first = (uint16_t)first;
        runs[0].count = (uint16_t)(end - first);
        *count = 1;
    }
    return 1;
}

/* Send what changed on the panel for the frame in `frame`. */
static void present_rows(rv565_player_t *p, uint16_t index, const uint8_t *frame,
                         rv565_frame_stats_t *s)
{
    if (p->display.begin_window != NULL && p->shown >= 0 && (int32_t)index == p->shown + 1 &&
            rv565_frame_type(p->clip, index) == RV565_FRAME_REGION &&
            present_region(p, index, frame, s)) {
        return;
    }
    rv565_line_run_t runs[RV565_PLAYER_MAX_RUNS];
    size_t count;
    const int known = changed_since_shown(p, index, runs, &count);
    if (known && count == 0) {
        return;  /* the panel already shows these pixels */
    }
    if (!known || (p->display.begin_rows == NULL && p->display.begin_window == NULL)) {
        send_rows(p, frame, 0, p->panel_height, s);  /* no row window: full write */
        return;
    }
    /* Map source-line runs to panel rows; adjacent row ranges merge. */
    uint16_t pend_first = 0, pend_end = 0;
    for (size_t r = 0; r < count; ++r) {
        const uint16_t d0 = row_for_line(p, runs[r].first);
        const uint16_t d1 = row_for_line(p, (uint32_t)runs[r].first + runs[r].count);
        if (d0 == d1) {
            continue;  /* scaled away */
        }
        if (pend_end == d0 && pend_end != pend_first) {
            pend_end = d1;
            continue;
        }
        if (pend_end != pend_first) {
            send_rows(p, frame, pend_first, (uint16_t)(pend_end - pend_first), s);
        }
        pend_first = d0;
        pend_end = d1;
    }
    if (pend_end != pend_first) {
        send_rows(p, frame, pend_first, (uint16_t)(pend_end - pend_first), s);
    }
}

/* Decode one record synchronously on the critical path. */
static rv565_status_t decode_one(rv565_player_t *p, uint16_t j, const uint8_t *prev,
                                 uint8_t *dst, uint32_t *us)
{
    const size_t frame_bytes = rv565_frame_bytes(&p->clip->header);
    const uint32_t t = p->micros();
    rv565_status_t status;
    if (p->decoder.start != NULL) {
        p->decoder.start(p->decoder.ctx, j, prev, dst, frame_bytes);
        return p->decoder.finish(p->decoder.ctx, us);
    }
    if (p->decoder.decode != NULL) {
        status = p->decoder.decode(p->decoder.ctx, j, prev, dst, frame_bytes);
    } else {
        status = rv565_decode(p->clip, j, prev, dst, frame_bytes, NULL, 0);
    }
    *us = p->micros() - t;
    return status;
}

/* Bring source frame `index` into a frame buffer and return which one. A
 * frame already decoded (the prefetch, or the presented frame) costs nothing;
 * otherwise decoding resumes from the latest buffered frame on the chain from
 * the keyframe at or before `index`, or from that keyframe. */
static rv565_status_t bring(rv565_player_t *p, uint16_t index, int *out,
                            rv565_frame_stats_t *s)
{
    const int buffers = p->frames[1] != NULL ? 2 : 1;
    for (int b = 0; b < buffers; ++b) {
        if (p->held[b] == (int32_t)index) {
            if (b != p->current) {
                s->inflate_us = p->ready_inflate_us;  /* prefetched */
            }
            *out = b;
            return RV565_OK;
        }
    }
    const int32_t key = rv565_keyframe_at_or_before(p->clip, index);
    if (key < 0) {
        return (rv565_status_t)key;
    }
    int b = p->current;
    uint32_t j = (uint32_t)key;
    for (int c = 0; c < buffers; ++c) {
        if (p->held[c] >= key && p->held[c] < (int32_t)index && p->held[c] + 1 > (int32_t)j) {
            b = c;
            j = (uint32_t)p->held[c] + 1u;
        }
    }
    for (; j <= index; ++j) {
        if (rv565_frame_type(p->clip, (uint16_t)j) == RV565_FRAME_REPEAT && p->held[b] == (int32_t)j - 1) {
            p->held[b] = (int32_t)j;  /* same pixels: nothing to decode */
            continue;
        }
        const int dst = buffers == 2 ? b ^ 1 : b;
        p->held[dst] = -1;
        uint32_t us = 0;
        const rv565_status_t status = decode_one(p, (uint16_t)j, p->frames[b], p->frames[dst], &us);
        s->inflate_us += us;
        ++s->decoded;
        if (status != RV565_OK) {
            return status;
        }
        p->held[dst] = (int32_t)j;
        b = dst;
    }
    *out = b;
    return RV565_OK;
}

rv565_status_t rv565_player_present(rv565_player_t *p, uint16_t index,
                                    rv565_frame_stats_t *stats)
{
    rv565_frame_stats_t local;
    rv565_frame_stats_t *s = stats != NULL ? stats : &local;
    memset(s, 0, sizeof(*s));
    const rv565_header_t *h = &p->clip->header;
    if (index >= h->frames) {
        return RV565_ERR_RANGE;
    }
    const uint32_t work_start = p->micros();
    int b;
    rv565_status_t status = bring(p, index, &b, s);
    if (status != RV565_OK) {
        return status;
    }
    p->current = b;

    /* Dual-core path: decode the next frame into the other buffer while this
     * one is transferred. A repeat needs no decode (it stays in this buffer);
     * a delta reads this buffer, which the display only reads too. */
    const uint16_t next = (uint16_t)((index + 1u) % h->frames);
    const int other = b ^ 1;
    const int prefetch = p->decoder.start != NULL && next != index &&
                         p->held[other] != (int32_t)next &&
                         rv565_frame_type(p->clip, next) != RV565_FRAME_REPEAT;
    if (prefetch) {
        p->held[other] = -1;
        p->decoder.start(p->decoder.ctx, next, p->frames[b], p->frames[other],
                         rv565_frame_bytes(h));
    }

    /* Send only what changed since the frame on the panel: nothing for a
     * repeat or the same frame again, the changed bands of a partial delta,
     * the bands' ranges of a region delta, everything for a keyframe or
     * delta. */
    present_rows(p, index, p->frames[b], s);
    p->shown = index;

    if (prefetch) {
        status = p->decoder.finish(p->decoder.ctx, &p->ready_inflate_us);
        if (status != RV565_OK) {
            return status;
        }
        p->held[other] = (int32_t)next;
    }
    s->work_us = p->micros() - work_start;
    return RV565_OK;
}
