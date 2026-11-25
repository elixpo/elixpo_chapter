/* RV565 ESP-IDF example: play an embedded clip on an ST7789 panel (320x240 by default),
 * inflating on core 1 while core 0 scales and DMA-transfers (the paper's
 * dual-core configuration). Replace main/clip.rv565 with your own video:
 *   python3 tools/rv565.py encode input.mp4 main/clip.rv565 */
#include <stdio.h>

#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "rv565_player.h"
#include "port/esp32/rv565_esp32.h"

/* Your panel: RV565_PANEL_320X240, _240X320, _240X240, _135X240 or
 * _240X135 (see rv565_panel.h). PANEL_W and PANEL_H must match it. */
#define PANEL       RV565_PANEL_320X240
#define PANEL_W     320
#define PANEL_H     240
#define STRIPE_ROWS 24
#define MAX_FRAMES  4096

static const char *TAG = "rv565";

extern const uint8_t clip_start[] asm("_binary_clip_rv565_start");
extern const uint8_t clip_end[] asm("_binary_clip_rv565_end");

static uint32_t frame_index[MAX_FRAMES];
static uint16_t xmap[PANEL_W], ymap[PANEL_H];

void app_main(void)
{
    rv565_clip_t clip;
    rv565_status_t st = rv565_open(&clip, clip_start, (size_t)(clip_end - clip_start),
                                   frame_index, MAX_FRAMES, PANEL_W, PANEL_H);
    if (st != RV565_OK) {
        ESP_LOGE(TAG, "open: %s", rv565_strerror(st));
        return;
    }

    rv565_schedule_report_t report;
    rv565_check_schedule(&clip, &RV565_COST_ESP32S3_180x135, 31312.0f, 1, &report);
    ESP_LOGI(TAG, "%ux%u @ %u FPS, %u frames; predicted late frames: %u",
             clip.header.width, clip.header.height, clip.header.fps,
             clip.header.frames, report.late_frames);

    const size_t stripe_bytes = PANEL_W * STRIPE_ROWS * 2;
    const size_t frame_bytes = rv565_frame_bytes(&clip.header);
    rv565_player_t player = {
        .clip = &clip,
        .panel_width = PANEL_W,
        .panel_height = PANEL_H,
        .stripe_rows = STRIPE_ROWS,
        .xmap = xmap,
        .ymap = ymap,
        .micros = rv565_esp32_micros,
    };
    for (int i = 0; i < 2; ++i) {
        player.stripes[i] = heap_caps_aligned_alloc(4, stripe_bytes, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
        player.frames[i] = heap_caps_malloc(frame_bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    }

    const rv565_esp32_display_config_t display = {
        .host = SPI2_HOST, .pin_mosi = 11, .pin_sclk = 12, .pin_cs = 14,
        .pin_dc = 15, .pin_rst = 16, .pin_bl = 17,
        .clock_hz = 40 * 1000 * 1000, .max_stripe_bytes = stripe_bytes,
        .panel = PANEL,
    };
    if ((st = rv565_esp32_display_init(&display, &player.display)) != RV565_OK ||
            (st = rv565_esp32_decoder_init(&clip, 1, &player.decoder)) != RV565_OK ||
            (st = rv565_player_init(&player)) != RV565_OK) {
        ESP_LOGE(TAG, "init: %s", rv565_strerror(st));
        return;
    }

    rv565_pacer_t pacer;
    rv565_pacer_start(&pacer, &clip.header, rv565_esp32_micros());
    for (bool backlight_on = false;;) {
        rv565_frame_stats_t stats;
        if ((st = rv565_player_present(&player, pacer.frame, &stats)) != RV565_OK) {
            ESP_LOGE(TAG, "present: %s", rv565_strerror(st));
            return;
        }
        if (!backlight_on) {
            rv565_esp32_backlight(1);
            backlight_on = true;
        }
        uint32_t wait_us;
        rv565_pacer_advance(&pacer, rv565_esp32_micros(), &wait_us);
        if (wait_us) {
            esp_rom_delay_us(wait_us);
        }
    }
}
