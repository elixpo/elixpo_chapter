/* RV565 Pico SDK example for the Raspberry Pi Pico 2 (RP2350) and an ST7789
 * 320x240 SPI panel. EXPERIMENTAL: the RP2350 port is not yet measured.
 * Core 1 inflates the next frame while core 0 scales and DMA-transfers. */
#include <stdio.h>

#include "pico/stdlib.h"
#include "rv565_player.h"
#include "port/rp2/rv565_rp2.h"
#include "clip.h"

/* Your panel: RV565_PANEL_320X240, _240X320, _240X240, _135X240 or
 * _240X135 (see rv565_panel.h). PANEL_W and PANEL_H must match it. */
#define PANEL       RV565_PANEL_320X240
#define PANEL_W     320
#define PANEL_H     240
#define STRIPE_ROWS 24
#define STRIPE_BYTES (PANEL_W * STRIPE_ROWS * 2)
#define MAX_FRAME_BYTES (180 * 135 * 2)

static uint32_t frame_index[1024];
static uint16_t xmap[PANEL_W], ymap[PANEL_H];
static uint8_t stripes[2][STRIPE_BYTES] __attribute__((aligned(4)));
static uint8_t frames[2][MAX_FRAME_BYTES] __attribute__((aligned(4)));

static void fail(const char *what, rv565_status_t st)
{
    for (;;) {
        printf("rv565: %s: %s\n", what, rv565_strerror(st));
        sleep_ms(1000);
    }
}

int main(void)
{
    stdio_init_all();

    rv565_clip_t clip;
    rv565_status_t st = rv565_open(&clip, rv565_clip, rv565_clip_size,
                                   frame_index, 1024, PANEL_W, PANEL_H);
    if (st != RV565_OK) fail("open", st);
    if (rv565_frame_bytes(&clip.header) > MAX_FRAME_BYTES) fail("frame size", RV565_ERR_ARG);

    rv565_player_t player = {
        .clip = &clip,
        .panel_width = PANEL_W,
        .panel_height = PANEL_H,
        .stripe_rows = STRIPE_ROWS,
        .stripes = { stripes[0], stripes[1] },
        .frames = { frames[0], frames[1] },
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
    if ((st = rv565_rp2_decoder_init(&clip, &player.decoder)) != RV565_OK) fail("decoder", st);
    if ((st = rv565_player_init(&player)) != RV565_OK) fail("player", st);

    rv565_pacer_t pacer;
    rv565_pacer_start(&pacer, &clip.header, rv565_rp2_micros());
    for (bool backlight_on = false;;) {
        rv565_frame_stats_t stats;
        if ((st = rv565_player_present(&player, pacer.frame, &stats)) != RV565_OK) fail("present", st);
        if (!backlight_on) {
            rv565_rp2_backlight(1);
            backlight_on = true;
        }
        uint32_t wait_us;
        rv565_pacer_advance(&pacer, rv565_rp2_micros(), &wait_us);
        if (wait_us) sleep_us(wait_us);
    }
}
