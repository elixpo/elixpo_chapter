/* RP2040/RP2350 port: ST7789 over SPI with DMA, and an inflate worker on
 * core 1. Builds with the Pico SDK and with Arduino-Pico.
 *
 * EXPERIMENTAL: not yet measured on hardware. See docs/ECOSYSTEM.md. */
#ifndef RV565_RP2_H
#define RV565_RP2_H

#include "../../rv565_panel.h"
#include "../../rv565_player.h"

#if RV565_PORT_RP2

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    int spi_index;      /* 0 or 1 */
    int pin_mosi;
    int pin_sclk;
    int pin_cs;
    int pin_dc;
    int pin_rst;        /* -1 if not connected */
    int pin_bl;         /* -1 if not connected */
    int clock_hz;       /* the SPI peripheral rounds to clk_peri / even divisor */
    rv565_panel_t panel; /* e.g. RV565_PANEL_240X240; zeroed means 320x240 */
} rv565_rp2_display_config_t;

rv565_status_t rv565_rp2_display_init(const rv565_rp2_display_config_t *cfg,
                                      rv565_display_ops_t *ops);

/* Launch the inflate worker on core 1. Do not combine with Arduino-Pico's
 * setup1()/loop1(), which also claim core 1. */
rv565_status_t rv565_rp2_decoder_init(const rv565_clip_t *clip,
                                      rv565_decoder_ops_t *ops);

uint32_t rv565_rp2_micros(void);
void rv565_rp2_backlight(int on);

#ifdef __cplusplus
}
#endif

#endif /* RV565_PORT_RP2 */
#endif /* RV565_RP2_H */
