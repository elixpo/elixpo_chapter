/* RV565 benchmark for the Raspberry Pi Pico 2 (RP2350) and a 2.0" ST7789
 * 320x240 SPI panel.
 *
 * Same method and output schema as benchmarks/esp32s3_video_dma, so
 * tools/collect_video_benchmark.py --platform rp2350 can record it: warm up
 * for two seconds, record 30 seconds of per-frame timings in RAM, then print
 * RV565_SUMMARY and one RV565_FRAME line per presented frame.
 *
 * The Pico's USB serial has no reset line, so each run starts when the host
 * sends a byte; the board then waits for the next one, which allows repeated
 * runs without reflashing.
 *
 * Wiring (SPI0): SCLK GP18, MOSI GP19, CS GP17, DC GP20, RST GP21, BL GP22.
 * The panel is optional for measurement: SPI clocks the bytes out either way.
 *
 * RV565_CODEC=1 swaps the decoder for the MJPEG baseline, as in
 * benchmarks/esp32s3_video_dma: each frame is a baseline JPEG
 * (tools/encode_mjpeg_benchmark.py), decoded to big-endian RGB565 by bitbank2's
 * JPEGDEC. Scaling, stripes, DMA, pacing and measurement are shared. Frames
 * reach the player through its decoder backend: on core 1 with
 * RV565_OVERLAP=1, inline on core 0 with RV565_OVERLAP=0.
 */
#include <stdio.h>
#include <string.h>

#include "hardware/clocks.h"
#include "hardware/spi.h"
#include "pico/stdio_usb.h"
#include "pico/stdlib.h"
#include "rv565_player.h"
#include "port/rp2/rv565_rp2.h"

#ifndef RV565_OVERLAP
#define RV565_OVERLAP 1
#endif
#ifndef RV565_CODEC
#define RV565_CODEC 0
#endif
#define CODEC_MJPEG (RV565_CODEC == 1)

#if CODEC_MJPEG
#include "JPEGDEC.h"
#include "pico/multicore.h"
#endif

#define PANEL           RV565_PANEL_320X240
#define PANEL_W         320
#define PANEL_H         240
#define STRIPE_ROWS     24
#define STRIPE_BYTES    (PANEL_W * STRIPE_ROWS * 2)
#define MAX_FRAME_BYTES (180 * 135 * 2)
#define MAX_FRAMES      4096
#define WARMUP_SECONDS  2
#define SAMPLE_SECONDS  30

extern const uint8_t rv565_video_start[];
extern const uint8_t rv565_video_end[];

typedef struct {
    uint32_t sequence;
    uint32_t source_frame;
    uint32_t inflate_us;
    uint32_t scale_us;
    uint32_t dma_wait_us;
    uint32_t lcd_us;
    uint32_t work_us;
    uint32_t skipped;
    uint32_t deadline_missed;
} frame_sample_t;

static uint32_t frame_index[MAX_FRAMES];
static uint16_t xmap[PANEL_W], ymap[PANEL_H];
static uint8_t stripes[2][STRIPE_BYTES] __attribute__((aligned(4)));
static uint8_t frames[2][MAX_FRAME_BYTES] __attribute__((aligned(4)));
static frame_sample_t samples[SAMPLE_SECONDS * RV565_MAX_FPS];

static void fail(const char *what, rv565_status_t st)
{
    for (;;) {
        printf("RV565_ERROR,%s,%s\n", what, rv565_strerror(st));
        sleep_ms(1000);
    }
}

#if CODEC_MJPEG
/* MJPEG container: "MJP" 0x01 | u16 w | u16 h | u8 fps | u8 0 | u16 frames,
 * then per frame a u32 little-endian length and a baseline JPEG. */
#define MJPEG_HEADER_SIZE 12
static uint32_t jpeg_bytes[MAX_FRAMES];
static JPEGIMAGE jpeg;  /* one decode at a time, on whichever core decodes */

static uint32_t rd16(const uint8_t *p) { return p[0] | (uint32_t)p[1] << 8; }
static uint32_t rd32(const uint8_t *p) { return rd16(p) | rd16(p + 2) << 16; }

static rv565_status_t mjpeg_open(rv565_clip_t *clip, const uint8_t *data, size_t size)
{
    if (size < MJPEG_HEADER_SIZE || memcmp(data, "MJP\x01", 4) != 0) return RV565_ERR_MAGIC;
    clip->header.width = (uint16_t)rd16(data + 4);
    clip->header.height = (uint16_t)rd16(data + 6);
    clip->header.fps = data[8];
    clip->header.flags = 0;
    clip->header.frames = (uint16_t)rd16(data + 10);
    /* Every frame stands alone, as in an RV565 version 6 file, so the player
     * never asks for a previous frame. */
    clip->header.version = RV565_CONTAINER_V6;
    clip->header.header_size = MJPEG_HEADER_SIZE;
    clip->header.pixel_format = RV565_PIXEL_RGB565BE;
    clip->header.codec = RV565_CODEC_ZLIB;
    clip->header.keyframe_interval = 1;
    const rv565_header_t *h = &clip->header;
    if (!h->width || !h->height || !h->fps || h->fps > RV565_MAX_FPS_V6 || !h->frames ||
            h->frames > MAX_FRAMES) {
        return RV565_ERR_HEADER;
    }
    size_t at = MJPEG_HEADER_SIZE;
    for (uint32_t i = 0; i < h->frames; ++i) {
        if (size - at < 4) return RV565_ERR_TRUNCATED;
        jpeg_bytes[i] = rd32(data + at);
        at += 4;
        if (size - at < jpeg_bytes[i]) return RV565_ERR_TRUNCATED;
        frame_index[i] = (uint32_t)at;
        at += jpeg_bytes[i];
    }
    if (at != size) return RV565_ERR_TRAILING;
    clip->data = data;
    clip->size = size;
    clip->index = frame_index;
    return RV565_OK;
}

typedef struct {
    uint8_t *dst;
    uint16_t width;
} jpeg_target_t;

/* JPEGDEC hands over blocks of MCUs; copy the visible part into the frame. */
static int jpeg_draw(JPEGDRAW *d)
{
    const jpeg_target_t *t = d->pUser;
    for (int r = 0; r < d->iHeight; ++r) {
        memcpy(t->dst + ((size_t)(d->y + r) * t->width + d->x) * 2u,
               d->pPixels + (size_t)r * d->iWidth, (size_t)d->iWidthUsed * 2u);
    }
    return 1;
}

/* Header parsing is part of each frame's decode, as it would be in a player. */
static rv565_status_t jpeg_decode_frame(const rv565_clip_t *clip, uint16_t index, uint8_t *dst)
{
    jpeg_target_t target = { dst, clip->header.width };
    if (!JPEG_openRAM(&jpeg, (uint8_t *)clip->data + clip->index[index],
                      (int)jpeg_bytes[index], jpeg_draw)) {
        return RV565_ERR_INFLATE;
    }
    rv565_status_t st = RV565_ERR_INFLATE;
    if (JPEG_getWidth(&jpeg) == clip->header.width &&
            JPEG_getHeight(&jpeg) == clip->header.height) {
        JPEG_setPixelType(&jpeg, RGB565_BIG_ENDIAN);  /* openRAM resets it */
        jpeg.pUser = &target;
        if (JPEG_decode(&jpeg, 0, 0, 0)) st = RV565_OK;
    }
    JPEG_close(&jpeg);
    return st;
}

#if RV565_OVERLAP
/* Decode on core 1 while core 0 scales and transfers, like the RV565 port. */
static uint32_t core1_stack[16 * 1024 / 4];
static struct {
    const rv565_clip_t *clip;
    volatile uint16_t index;
    uint8_t *volatile dst;
    volatile rv565_status_t status;
    volatile uint32_t decode_us;
} job;

static void core1_main(void)
{
    for (;;) {
        (void)multicore_fifo_pop_blocking();
        const uint32_t t = time_us_32();
        job.status = jpeg_decode_frame(job.clip, job.index, job.dst);
        job.decode_us = time_us_32() - t;
        multicore_fifo_push_blocking(1);
    }
}

static void jpeg_start(void *ctx, uint16_t index, const uint8_t *prev, uint8_t *dst, size_t len)
{
    (void)prev;
    (void)len;
    job.clip = ctx;
    job.index = index;
    job.dst = dst;
    multicore_fifo_push_blocking(0);
}

static rv565_status_t jpeg_finish(void *ctx, uint32_t *decode_us)
{
    (void)ctx;
    (void)multicore_fifo_pop_blocking();
    *decode_us = job.decode_us;
    return job.status;
}
#else
/* Serial: decode, then transfer, on core 0, decoding only the frame that is
 * presented, as the RV565 serial path does: the player calls this backend
 * in place of rv565_decode(). */
static rv565_status_t jpeg_decode(void *ctx, uint16_t index, const uint8_t *prev,
                                  uint8_t *dst, size_t len)
{
    (void)prev;
    (void)len;
    return jpeg_decode_frame(ctx, index, dst);
}
#endif
#endif /* CODEC_MJPEG */

static bool present(rv565_player_t *player, uint16_t frame, frame_sample_t *sample)
{
    rv565_frame_stats_t stats;
    if (rv565_player_present(player, frame, &stats) != RV565_OK) {
        return false;
    }
    sample->inflate_us = stats.inflate_us;
    sample->scale_us = stats.scale_us;
    sample->dma_wait_us = stats.wait_us;
    sample->lcd_us = stats.transfer_us;
    sample->work_us = stats.work_us;
    return true;
}

static void print_metadata(const rv565_clip_t *clip, uint32_t warmup, uint32_t count)
{
    printf("RV565_META,schema=1\n");
    printf("RV565_META,platform=rp2350\n");
    printf("RV565_META,cpu_mhz=%lu\n", (unsigned long)(clock_get_hz(clk_sys) / 1000000));
    printf("RV565_META,spi_khz=%lu\n", (unsigned long)(spi_get_baudrate(spi0) / 1000));
    printf("RV565_META,source_width=%u\n", clip->header.width);
    printf("RV565_META,source_height=%u\n", clip->header.height);
    printf("RV565_META,source_fps=%u\n", clip->header.fps);
    printf("RV565_META,source_frames=%u\n", clip->header.frames);
#if CODEC_MJPEG
    printf("RV565_META,container_version=1\n");
#else
    printf("RV565_META,container_version=%u\n", clip->header.version);
#endif
    printf("RV565_META,container_bytes=%u\n", (unsigned)(rv565_video_end - rv565_video_start));
    printf("RV565_META,warmup_frames=%lu\n", (unsigned long)warmup);
    printf("RV565_META,sample_frames=%lu\n", (unsigned long)count);
    printf("RV565_META,overlap=%d\n", RV565_OVERLAP);
#if CODEC_MJPEG
    printf("RV565_META,codec=mjpeg\n");
    printf("RV565_META,decoder=JPEGDEC %s\n", RV565_JPEGDEC_VERSION);
#endif
    printf("RV565_META,library_version=%d.%d.%d\n",
           RV565_VERSION_MAJOR, RV565_VERSION_MINOR, RV565_VERSION_PATCH);
    printf("RV565_READY\n");
}

/* Advance to the next source frame, skipping frames (never displaying them;
 * the player decodes only the delta records the next frame depends on) while
 * more than one period late; returns the number skipped. */
static uint32_t pace(const rv565_clip_t *clip, uint16_t *frame, uint64_t *deadline,
                     uint64_t period, uint64_t now)
{
    uint32_t skipped = 0;
    *frame = (uint16_t)((*frame + 1u) % clip->header.frames);
    *deadline += period;
    while (now > *deadline + period) {
        *frame = (uint16_t)((*frame + 1u) % clip->header.frames);
        *deadline += period;
        ++skipped;
    }
    return skipped;
}

static void run(const rv565_clip_t *clip, rv565_player_t *player, bool *backlight_on)
{
    const uint64_t period = 1000000u / clip->header.fps;
    const uint32_t warmup = WARMUP_SECONDS * clip->header.fps;
    const uint32_t count = SAMPLE_SECONDS * clip->header.fps;
    frame_sample_t scratch = {0};
    uint16_t frame = 0;

    print_metadata(clip, warmup, count);

    uint64_t deadline = time_us_64();
    for (uint32_t i = 0; i < warmup; ++i) {
        if (!present(player, frame, &scratch)) fail("warm-up frame", RV565_ERR_INFLATE);
        if (!*backlight_on) {  /* first frame drawn: hide stale panel RAM until now */
            rv565_rp2_backlight(1);
            *backlight_on = true;
        }
        const uint64_t now = time_us_64();
        pace(clip, &frame, &deadline, period, now);
        if (deadline > now) sleep_us(deadline - now);
    }

    printf("RV565_BEGIN\n");
    const uint64_t start = time_us_64();
    uint32_t dropped = 0, misses = 0;
    deadline = start;
    for (uint32_t i = 0; i < count; ++i) {
        frame_sample_t *s = &samples[i];
        s->sequence = i;
        s->source_frame = frame;
        if (!present(player, frame, s)) fail("measured frame", RV565_ERR_INFLATE);
        const uint64_t now = time_us_64();
        s->deadline_missed = now > deadline + period;
        misses += s->deadline_missed;
        s->skipped = pace(clip, &frame, &deadline, period, now);
        dropped += s->skipped;
        if (i + 1 < count && deadline > now) sleep_us(deadline - now);
    }
    const uint64_t elapsed = time_us_64() - start;

    printf("RV565_SUMMARY,frames=%lu,elapsed_us=%llu,fps=%.6f,drops=%lu,deadline_misses=%lu\n",
           (unsigned long)count, (unsigned long long)elapsed,
           count * 1000000.0 / (double)elapsed, (unsigned long)dropped, (unsigned long)misses);
    printf("RV565_COLUMNS,sequence,source_frame,inflate_us,scale_us,"
           "dma_wait_us,lcd_us,work_us,skipped,deadline_missed\n");
    for (uint32_t i = 0; i < count; ++i) {
        const frame_sample_t *s = &samples[i];
        printf("RV565_FRAME,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu,%lu\n",
               (unsigned long)s->sequence, (unsigned long)s->source_frame,
               (unsigned long)s->inflate_us, (unsigned long)s->scale_us,
               (unsigned long)s->dma_wait_us, (unsigned long)s->lcd_us,
               (unsigned long)s->work_us, (unsigned long)s->skipped,
               (unsigned long)s->deadline_missed);
    }
    printf("RV565_END\n");
}

int main(void)
{
    stdio_init_all();

    rv565_clip_t clip;
#if CODEC_MJPEG
    rv565_status_t st = mjpeg_open(&clip, rv565_video_start,
                                   (size_t)(rv565_video_end - rv565_video_start));
#else
    rv565_status_t st = rv565_open(&clip, rv565_video_start,
                                   (size_t)(rv565_video_end - rv565_video_start),
                                   frame_index, MAX_FRAMES, PANEL_W, PANEL_H);
#endif
    if (st != RV565_OK) fail("open", st);
    if (rv565_frame_bytes(&clip.header) > MAX_FRAME_BYTES) fail("frame size", RV565_ERR_ARG);

    rv565_player_t player = {
        .clip = &clip,
        .panel_width = PANEL_W,
        .panel_height = PANEL_H,
        .stripe_rows = STRIPE_ROWS,
        .stripes = { stripes[0], stripes[1] },
        .frames = { frames[0], frames[1] },  /* frames[1]: overlap, or zlib deltas */
        .xmap = xmap,
        .ymap = ymap,
        .micros = rv565_rp2_micros,
    };
    const rv565_rp2_display_config_t display = {
        .spi_index = 0, .pin_mosi = 19, .pin_sclk = 18, .pin_cs = 17,
        .pin_dc = 20, .pin_rst = 21, .pin_bl = 22, .clock_hz = 40 * 1000 * 1000,
        .panel = PANEL,
    };
    if ((st = rv565_rp2_display_init(&display, &player.display)) != RV565_OK) fail("display", st);
#if CODEC_MJPEG
#if RV565_OVERLAP
    multicore_launch_core1_with_stack(core1_main, core1_stack, sizeof(core1_stack));
#endif
    player.decoder.ctx = &clip;
#if RV565_OVERLAP
    player.decoder.start = jpeg_start;
    player.decoder.finish = jpeg_finish;
#else
    player.decoder.decode = jpeg_decode;
#endif
#elif RV565_OVERLAP
    if ((st = rv565_rp2_decoder_init(&clip, &player.decoder)) != RV565_OK) fail("decoder", st);
#endif
    if ((st = rv565_player_init(&player)) != RV565_OK) fail("player", st);

    bool backlight_on = false;
    for (;;) {
        while (!stdio_usb_connected()) sleep_ms(50);
        printf("RV565_WAITING (send any byte to start a run)\n");
        int c;
        do {
            c = getchar_timeout_us(500000);
        } while (c == PICO_ERROR_TIMEOUT);
        run(&clip, &player, &backlight_on);
    }
}
