/* ESP32 port: ST7789 over SPI with GDMA, and an inflate worker on core 1.
 * Works under ESP-IDF and Arduino-ESP32. Measured on the ESP32-S3 in the
 * RV565 paper; other ESP32 chips are untested. */
#ifndef RV565_ESP32_H
#define RV565_ESP32_H

#include "../../rv565_panel.h"
#include "../../rv565_player.h"

#if RV565_PORT_ESP32

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int host;           /* SPI host, e.g. SPI2_HOST */
    int pin_mosi;
    int pin_sclk;
    int pin_cs;         /* driven manually so CS spans the whole frame */
    int pin_dc;
    int pin_rst;        /* -1 if not connected */
    int pin_bl;         /* -1 if not connected; driven high when ready */
    int clock_hz;       /* 40 MHz in the paper */
    size_t max_stripe_bytes;
    rv565_panel_t panel; /* e.g. RV565_PANEL_240X240; zeroed means 320x240 */
} rv565_esp32_display_config_t;

/* Initialise SPI and the panel, and fill `ops` for the player. */
rv565_status_t rv565_esp32_display_init(const rv565_esp32_display_config_t *cfg,
                                        rv565_display_ops_t *ops);

/* Start the inflate worker pinned to `core` (1 on dual-core chips) and fill
 * `ops`. The worker task needs a 24 KiB stack because tinfl keeps its
 * decompressor state on the stack. */
rv565_status_t rv565_esp32_decoder_init(const rv565_clip_t *clip, int core,
                                        rv565_decoder_ops_t *ops);

/* Microsecond clock for rv565_player_t.micros. */
uint32_t rv565_esp32_micros(void);

/* Turn the backlight on (call after the first frame has been drawn). */
void rv565_esp32_backlight(int on);

#ifdef __cplusplus
}
#endif

#endif /* RV565_PORT_ESP32 */
#endif /* RV565_ESP32_H */
