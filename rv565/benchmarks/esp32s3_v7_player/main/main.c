/* RV565 version 7 and 8 playback benchmark for the Falera Badge.
 *
 * Plays the embedded clip forever on the badge's 320x240 ST7789 (40 MHz SPI,
 * pins as on the badge) and prints one line per pass through the clip:
 * frames presented, late frames (finished after their deadline), frames the
 * pacer skipped, the critical-path frame work and display transfer per frame,
 * and the share of panel rows and pixels sent. Partial deltas send only the
 * rows of their changed bands, region deltas (version 8) only each band's
 * changed columns; compare a clip against the same clip encoded with --v7
 * or --band-lines 0.
 *
 * Build: idf.py -DRV565_CLIP=/abs/path/clip.rv565 -DRV565_OVERLAP=1 build
 * (see README.md). */
#include <stdio.h>

#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "rv565_player.h"
#include "port/esp32/rv565_esp32.h"

#define PANEL       RV565_PANEL_320X240
#define PANEL_W     320
#define PANEL_H     240
#define STRIPE_ROWS 24
#define MAX_FRAMES  4096

static const char *TAG = "rv565-v7";

extern const uint8_t clip_start[] asm("_binary_clip_rv565_start");
extern const uint8_t clip_end[] asm("_binary_clip_rv565_end");

static uint32_t frame_index[MAX_FRAMES];
static uint16_t xmap[PANEL_W], ymap[PANEL_H];

typedef struct {
    uint32_t presented, late, skipped;
    uint64_t work_us, transfer_us, inflate_us, rows, pixels;
    uint32_t work_max_us, transfer_max_us;
} pass_stats_t;

static void report(int pass, const pass_stats_t *s, uint32_t period_us)
{
    const double n = s->presented ? (double)s->presented : 1.0;
    printf("pass %d: %lu presented, %lu late, %lu skipped | work mean %.2f max %.2f ms | "
           "transfer mean %.2f max %.2f ms | decode mean %.2f ms | rows sent %.1f%% "
           "| pixels sent %.1f%% | period %.2f ms\n",
           pass, (unsigned long)s->presented, (unsigned long)s->late,
           (unsigned long)s->skipped, s->work_us / n / 1e3, s->work_max_us / 1e3,
           s->transfer_us / n / 1e3, s->transfer_max_us / 1e3, s->inflate_us / n / 1e3,
           100.0 * (double)s->rows / (n * PANEL_H),
           100.0 * (double)s->pixels / (n * PANEL_W * PANEL_H), period_us / 1e3);
    fflush(stdout);
}

void app_main(void)
{
    rv565_clip_t clip;
    rv565_status_t st = rv565_open(&clip, clip_start, (size_t)(clip_end - clip_start),
                                   frame_index, MAX_FRAMES, PANEL_W, PANEL_H);
    if (st != RV565_OK) {
        ESP_LOGE(TAG, "open: %s", rv565_strerror(st));
        return;
    }
    unsigned types[5] = {0};
    for (uint16_t i = 0; i < clip.header.frames; ++i) {
        const int t = rv565_frame_type(&clip, i);
        if (t >= 0 && t < 5) {
            ++types[t];
        }
    }
    printf("clip %s: v%u %ux%u @ %u FPS, %u frames, %u bytes, keyframe interval %u | "
           "%u key, %u delta, %u repeat, %u partial, %u region | %s\n",
           RV565_CLIP_NAME, clip.header.version, clip.header.width, clip.header.height,
           clip.header.fps, clip.header.frames, (unsigned)(clip_end - clip_start),
           clip.header.keyframe_interval, types[0], types[1], types[2], types[3], types[4],
           RV565_OVERLAP ? "dual-core (inflate on core 1)" : "serial");

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
        player.stripes[i] = heap_caps_aligned_alloc(4, stripe_bytes,
                                                    MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
        player.frames[i] = heap_caps_malloc(frame_bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
        if (player.stripes[i] == NULL || player.frames[i] == NULL) {
            ESP_LOGE(TAG, "out of memory for buffers");
            return;
        }
    }

    const rv565_esp32_display_config_t display = {
        .host = SPI2_HOST, .pin_mosi = 11, .pin_sclk = 12, .pin_cs = 14,
        .pin_dc = 15, .pin_rst = 16, .pin_bl = 17,
        .clock_hz = 40 * 1000 * 1000, .max_stripe_bytes = stripe_bytes,
        .panel = PANEL,
    };
    if ((st = rv565_esp32_display_init(&display, &player.display)) != RV565_OK ||
            (RV565_OVERLAP &&
             (st = rv565_esp32_decoder_init(&clip, 1, &player.decoder)) != RV565_OK) ||
            (st = rv565_player_init(&player)) != RV565_OK) {
        ESP_LOGE(TAG, "init: %s", rv565_strerror(st));
        return;
    }

    rv565_pacer_t pacer;
    rv565_pacer_start(&pacer, &clip.header, rv565_esp32_micros());
    pass_stats_t pass = {0};
    int pass_number = 0;
    for (bool backlight_on = false;;) {
        const uint16_t shown = pacer.frame;
        rv565_frame_stats_t stats;
        if ((st = rv565_player_present(&player, shown, &stats)) != RV565_OK) {
            ESP_LOGE(TAG, "present: %s", rv565_strerror(st));
            return;
        }
        if (!backlight_on) {
            rv565_esp32_backlight(1);
            backlight_on = true;
        }
        uint32_t wait_us;
        const uint16_t skipped = rv565_pacer_advance(&pacer, rv565_esp32_micros(), &wait_us);

        ++pass.presented;
        pass.late += wait_us == 0;
        pass.skipped += skipped;
        pass.work_us += stats.work_us;
        pass.transfer_us += stats.transfer_us;
        pass.inflate_us += stats.inflate_us;
        pass.rows += stats.rows_sent;
        pass.pixels += stats.pixels_sent;
        if (stats.work_us > pass.work_max_us) {
            pass.work_max_us = stats.work_us;
        }
        if (stats.transfer_us > pass.transfer_max_us) {
            pass.transfer_max_us = stats.transfer_us;
        }
        /* One line per pass through the clip, printed outside any deadline. */
        if (pacer.frame < shown || (pacer.frame == 0 && shown != 0)) {
            report(++pass_number, &pass, pacer.period_us);
            pass = (pass_stats_t){0};
            rv565_pacer_start(&pacer, &clip.header, rv565_esp32_micros());
        } else if (wait_us) {
            esp_rom_delay_us(wait_us);
        }
    }
}
