/* ST7789 initialisation sequence shared by the platform ports. Values are
 * those used by the RV565 benchmark firmware on a 2.0" 320x240 IPS panel;
 * rotation, window and inversion come from the rv565_panel_t. */
#ifndef RV565_ST7789_INIT_H
#define RV565_ST7789_INIT_H

#include <stddef.h>
#include <stdint.h>

#include "../rv565_panel.h"

/* A step whose len has this flag sends no data: it issues the command and
 * then waits data[0] milliseconds. Otherwise len is the data byte count. */
#define RV565_ST7789_DELAY 0x80

#define RV565_ST7789_RAMWR 0x2C
#define RV565_ST7789_STEPS 16

typedef struct {
    uint8_t cmd;
    uint8_t len;      /* data bytes, optionally | RV565_ST7789_DELAY */
    uint8_t data[5];
} rv565_st7789_step_t;

/* The panel to drive: `panel` itself, or the 320x240 default if it is NULL
 * or zeroed. */
static inline rv565_panel_t rv565_panel_resolve(const rv565_panel_t *panel)
{
    static const rv565_panel_t fallback = RV565_PANEL_320X240;
    return (panel == NULL || panel->width == 0 || panel->height == 0) ? fallback : *panel;
}

/* Fill `out` (RV565_ST7789_STEPS entries) with the init sequence for `panel`
 * and return the number of steps. The address window covers the whole panel,
 * so each frame only needs RAMWR. */
static inline size_t rv565_st7789_sequence(const rv565_panel_t *panel,
                                           rv565_st7789_step_t *out)
{
    const rv565_panel_t p = rv565_panel_resolve(panel);
    const unsigned x0 = p.x_offset, x1 = p.x_offset + p.width - 1u;
    const unsigned y0 = p.y_offset, y1 = p.y_offset + p.height - 1u;
    const rv565_st7789_step_t steps[RV565_ST7789_STEPS] = {
        { 0x01, RV565_ST7789_DELAY | 1, { 150 } },           /* software reset */
        { 0x11, RV565_ST7789_DELAY | 1, { 120 } },           /* sleep out */
        { 0x3A, 1, { 0x55 } },                               /* RGB565 */
        { 0x36, 1, { p.madctl } },                           /* rotation */
        { 0xB2, 5, { 0x0C, 0x0C, 0x00, 0x33, 0x33 } },       /* porch */
        { 0xC6, 1, { 0x0F } },                               /* 60 Hz scan */
        { 0xC0, 1, { 0x2C } },
        { 0xC2, 1, { 0x01 } },
        { 0xC3, 1, { 0x12 } },
        { 0xC4, 1, { 0x20 } },
        { 0xBB, 1, { 0x20 } },
        { 0x2A, 4, { (uint8_t)(x0 >> 8), (uint8_t)x0,
                     (uint8_t)(x1 >> 8), (uint8_t)x1 } },    /* columns */
        { 0x2B, 4, { (uint8_t)(y0 >> 8), (uint8_t)y0,
                     (uint8_t)(y1 >> 8), (uint8_t)y1 } },    /* rows */
        { (uint8_t)(p.invert ? 0x21 : 0x20), 0, { 0 } },     /* inversion */
        { 0x13, 0, { 0 } },                                  /* normal mode */
        { 0x29, RV565_ST7789_DELAY | 1, { 20 } },            /* display on */
    };
    for (size_t i = 0; i < RV565_ST7789_STEPS; ++i) {
        out[i] = steps[i];
    }
    return RV565_ST7789_STEPS;
}

#endif /* RV565_ST7789_INIT_H */
