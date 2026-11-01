// RV565 player for the ESP32-S3 with an ST7789 SPI panel (320x240 by default).
//
// Core 1 inflates the next frame while core 0 scales and DMA-transfers the
// current one; this is the configuration measured at 24 FPS with zero
// missed frames in the RV565 paper (arXiv:2610.35935).
//
// clip.h holds a small test pattern. Replace it with your own video:
//   python3 tools/rv565.py encode input.mp4 clip.rv565
//   python3 tools/rv565.py c-array clip.rv565 clip.h
// Large clips should go in their own flash partition instead of a C array.

#if !defined(ARDUINO_ARCH_ESP32)
#error "This example is for ESP32 boards; see Pico2_Player for RP2350."
#endif

#include <RV565.h>
#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "clip.h"

// Wiring used by the RV565 benchmark (ESP32-S3-DevKitC-1 + ST7789).
static const int PIN_MOSI = 11, PIN_SCLK = 12, PIN_CS = 14;
static const int PIN_DC = 15, PIN_RST = 16, PIN_BL = 17;

// Your panel: RV565_PANEL_320X240, _240X320, _240X240, _135X240 or _240X135
// (see rv565_panel.h), or fill an rv565_panel_t for another module.
constexpr rv565_panel_t PANEL = RV565_PANEL_320X240;
static const uint16_t PANEL_W = PANEL.width, PANEL_H = PANEL.height, STRIPE_ROWS = 24;
static const bool DUAL_CORE = true;

static rv565_clip_t clip;
static uint32_t frame_index[1024];
static uint16_t xmap[PANEL_W], ymap[PANEL_H];
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

    // Will this clip play without missed frames? Decided from metadata alone.
    rv565_schedule_report_t report;
    rv565_check_schedule(&clip, &RV565_COST_ESP32S3_180x135, 31312.0f, DUAL_CORE, &report);
    Serial.printf("rv565: %u frames, predicted late frames: %u\n",
                  clip.header.frames, report.late_frames);

    const size_t stripe_bytes = PANEL_W * STRIPE_ROWS * 2;
    const size_t frame_bytes = rv565_frame_bytes(&clip.header);
    player.clip = &clip;
    player.panel_width = PANEL_W;
    player.panel_height = PANEL_H;
    player.stripe_rows = STRIPE_ROWS;
    player.xmap = xmap;
    player.ymap = ymap;
    player.micros = rv565_esp32_micros;
    for (int i = 0; i < 2; ++i) {
        player.stripes[i] = (uint8_t *)heap_caps_aligned_alloc(4, stripe_bytes, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    }
    player.frames[0] = (uint8_t *)heap_caps_malloc(frame_bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    player.frames[1] = DUAL_CORE ? (uint8_t *)heap_caps_malloc(frame_bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) : NULL;

    const rv565_esp32_display_config_t display = {
        SPI2_HOST, PIN_MOSI, PIN_SCLK, PIN_CS, PIN_DC, PIN_RST, PIN_BL,
        40 * 1000 * 1000, stripe_bytes, PANEL,
    };
    if ((st = rv565_esp32_display_init(&display, &player.display)) != RV565_OK) fail("display", st);
    if (DUAL_CORE && (st = rv565_esp32_decoder_init(&clip, 1, &player.decoder)) != RV565_OK) fail("decoder", st);
    if ((st = rv565_player_init(&player)) != RV565_OK) fail("player", st);

    rv565_pacer_start(&pacer, &clip.header, rv565_esp32_micros());
}

void loop()
{
    static bool backlight_on = false;
    rv565_frame_stats_t stats;
    rv565_status_t st = rv565_player_present(&player, pacer.frame, &stats);
    if (st != RV565_OK) fail("present", st);
    if (!backlight_on) {  // first frame drawn: avoid showing stale panel RAM
        rv565_esp32_backlight(1);
        backlight_on = true;
    }
    uint32_t wait_us;
    rv565_pacer_advance(&pacer, rv565_esp32_micros(), &wait_us);
    if (wait_us) delayMicroseconds(wait_us);
}
