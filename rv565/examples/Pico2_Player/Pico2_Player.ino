// RV565 player for the Raspberry Pi Pico 2 (RP2350) with an ST7789 320x240
// SPI panel, using the Arduino-Pico core.
//
// EXPERIMENTAL: the RP2350 port has not been measured on hardware yet.
// Core 1 inflates the next frame while core 0 scales and DMA-transfers the
// current one. Do not define setup1()/loop1() in this sketch: the decoder
// owns core 1.
//
// clip.h holds a small test pattern; see ESP32S3_Player for encoding your
// own. The Pico 2 has 4 MB of flash, so keep clips well below that.

#if !defined(ARDUINO_ARCH_RP2040)
#error "This example is for RP2040/RP2350 boards with the Arduino-Pico core."
#endif

#include <RV565.h>
#include "clip.h"

// SPI0 on GP18/GP19; adjust to your wiring.
static const int PIN_SCLK = 18, PIN_MOSI = 19, PIN_CS = 17;
static const int PIN_DC = 20, PIN_RST = 21, PIN_BL = 22;

// Your panel: RV565_PANEL_320X240, _240X320, _240X240, _135X240 or _240X135
// (see rv565_panel.h), or fill an rv565_panel_t for another module.
constexpr rv565_panel_t PANEL = RV565_PANEL_320X240;
static const uint16_t PANEL_W = PANEL.width, PANEL_H = PANEL.height, STRIPE_ROWS = 24;
static const size_t STRIPE_BYTES = PANEL_W * STRIPE_ROWS * 2;
static const size_t MAX_FRAME_BYTES = 180 * 135 * 2;

static rv565_clip_t clip;
static uint32_t frame_index[1024];
static uint16_t xmap[PANEL_W], ymap[PANEL_H];
static uint8_t stripes[2][STRIPE_BYTES] __attribute__((aligned(4)));
static uint8_t frames[2][MAX_FRAME_BYTES] __attribute__((aligned(4)));
static rv565_player_t player;
static rv565_pacer_t pacer;

static void fail(const char *what, rv565_status_t st)
{
    Serial.printf("rv565: %s: %s\n", what, rv565_strerror(st));
    for (;;) delay(1000);
}

void setup()
{
    Serial.begin(115200);

    rv565_status_t st = rv565_open(&clip, rv565_clip, rv565_clip_size,
                                   frame_index, 1024, PANEL_W, PANEL_H);
    if (st != RV565_OK) fail("open", st);
    if (rv565_frame_bytes(&clip.header) > MAX_FRAME_BYTES) fail("frame size", RV565_ERR_ARG);

    player.clip = &clip;
    player.panel_width = PANEL_W;
    player.panel_height = PANEL_H;
    player.stripe_rows = STRIPE_ROWS;
    player.stripes[0] = stripes[0];
    player.stripes[1] = stripes[1];
    player.frames[0] = frames[0];
    player.frames[1] = frames[1];
    player.xmap = xmap;
    player.ymap = ymap;
    player.micros = rv565_rp2_micros;

    const rv565_rp2_display_config_t display = {
        0, PIN_MOSI, PIN_SCLK, PIN_CS, PIN_DC, PIN_RST, PIN_BL, 40 * 1000 * 1000, PANEL,
    };
    if ((st = rv565_rp2_display_init(&display, &player.display)) != RV565_OK) fail("display", st);
    if ((st = rv565_rp2_decoder_init(&clip, &player.decoder)) != RV565_OK) fail("decoder", st);
    if ((st = rv565_player_init(&player)) != RV565_OK) fail("player", st);

    rv565_pacer_start(&pacer, &clip.header, rv565_rp2_micros());
}

void loop()
{
    static bool backlight_on = false;
    rv565_frame_stats_t stats;
    rv565_status_t st = rv565_player_present(&player, pacer.frame, &stats);
    if (st != RV565_OK) fail("present", st);
    if (!backlight_on) {
        rv565_rp2_backlight(1);
        backlight_on = true;
    }
    uint32_t wait_us;
    rv565_pacer_advance(&pacer, rv565_rp2_micros(), &wait_us);
    if (wait_us) delayMicroseconds(wait_us);
}
