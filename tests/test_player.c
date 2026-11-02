/* Host test for the player: a mock display assembles stripes into a
 * framebuffer, and a synchronous mock decoder stands in for core 1. Both
 * the serial and dual-core paths must draw every frame exactly. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "rv565_player.h"

#define PW 320
#define PH 240
#define ROWS 24

static uint8_t screen[PW * PH * 2];
static size_t cursor;
static int queued, failures;
static uint32_t clock_us;
static const rv565_clip_t *g_clip;
static struct { uint16_t index; uint8_t *dst; size_t len; int pending; } job;

static uint32_t fake_micros(void) { return clock_us += 7; }
static void begin(void *c) { (void)c; cursor = 0; }
static void queue(void *c, const uint8_t *d, size_t n)
{
    (void)c;
    if (++queued > 2) { fprintf(stderr, "FAIL: more than two stripes queued\n"); ++failures; }
    memcpy(screen + cursor, d, n);
    cursor += n;
}
static void wait_one(void *c) { (void)c; --queued; }
static void end(void *c) { (void)c; }

static void dec_start(void *c, uint16_t i, uint8_t *dst, size_t n)
{
    (void)c;
    job.index = i; job.dst = dst; job.len = n; job.pending = 1;
}
static rv565_status_t dec_finish(void *c, uint32_t *us)
{
    (void)c;
    if (!job.pending) return RV565_ERR_ARG;
    job.pending = 0;
    *us = 1234;
    return rv565_decode_frame(g_clip, job.index, job.dst, job.len);
}

static uint8_t *load(const char *path, size_t *size)
{
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); exit(2); }
    fseek(f, 0, SEEK_END); *size = (size_t)ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *d = malloc(*size);
    if (fread(d, 1, *size, f) != *size) exit(2);
    fclose(f);
    return d;
}

static int check_frame(const rv565_clip_t *clip, uint16_t index, const char *mode)
{
    const rv565_header_t *h = &clip->header;
    uint8_t *frame = malloc(rv565_frame_bytes(h));
    static uint8_t expect[PW * PH * 2];
    uint16_t xmap[PW], ymap[PH];
    rv565_decode_frame(clip, index, frame, rv565_frame_bytes(h));
    rv565_build_map(xmap, h->width, PW);
    rv565_build_map(ymap, h->height, PH);
    rv565_scale_stripe(frame, h->width, xmap, PW, ymap, 0, PH, expect);
    free(frame);
    if (cursor != sizeof(screen) || memcmp(screen, expect, sizeof(screen)) != 0) {
        fprintf(stderr, "FAIL: %s frame %u drawn incorrectly\n", mode, index);
        return 1;
    }
    return 0;
}

static void run(const rv565_clip_t *clip, int overlap)
{
    static uint8_t s0[PW * ROWS * 2], s1[PW * ROWS * 2];
    uint8_t *f0 = malloc(rv565_frame_bytes(&clip->header));
    uint8_t *f1 = malloc(rv565_frame_bytes(&clip->header));
    static uint16_t xmap[PW], ymap[PH];
    rv565_player_t p = {
        .clip = clip, .panel_width = PW, .panel_height = PH, .stripe_rows = ROWS,
        .stripes = { s0, s1 }, .frames = { f0, overlap ? f1 : NULL },
        .xmap = xmap, .ymap = ymap,
        .display = { NULL, begin, queue, wait_one, end },
        .decoder = { NULL, overlap ? dec_start : NULL, overlap ? dec_finish : NULL },
        .micros = fake_micros,
    };
    const char *mode = overlap ? "overlap" : "serial";
    if (rv565_player_init(&p) != RV565_OK) { fprintf(stderr, "FAIL: init %s\n", mode); ++failures; return; }
    /* In order, then a skip, then a loop around the end of the clip. */
    const uint16_t last = (uint16_t)(clip->header.frames - 1);
    const uint16_t order[] = { 0, 1, 2, 5, 6, (uint16_t)(last - 1), last, 0, 1 };
    for (size_t k = 0; k < sizeof(order) / sizeof(order[0]); ++k) {
        rv565_frame_stats_t st;
        if (rv565_player_present(&p, order[k], &st) != RV565_OK) { fprintf(stderr, "FAIL: present\n"); ++failures; continue; }
        failures += check_frame(clip, order[k], mode);
        if (queued != 0) { fprintf(stderr, "FAIL: stripes left queued\n"); ++failures; }
    }
    if (overlap && (p.ready_frame != 2 || job.pending)) { fprintf(stderr, "FAIL: prefetch state\n"); ++failures; }
    free(f0); free(f1);
}

int main(int argc, char **argv)
{
    if (argc != 2) return 2;
    size_t size;
    uint8_t *data = load(argv[1], &size);
    static uint32_t index[65536];
    rv565_clip_t clip;
    if (rv565_open(&clip, data, size, index, 65536, 0, 0) != RV565_OK) return 1;
    g_clip = &clip;
    run(&clip, 0);
    run(&clip, 1);
    free(data);
    if (failures) { fprintf(stderr, "%d failure(s)\n", failures); return 1; }
    fprintf(stderr, "player checks passed (serial and overlap)\n");
    return 0;
}
