/* Panel geometry for the ST7789 platform ports.
 *
 * The ST7789 has 240x320 pixels of memory; smaller modules use a window of it,
 * so they need an offset, and landscape modules swap rows and columns through
 * MADCTL. Pass one of the presets below in the port's display config, or fill
 * the fields for another module. A zeroed panel selects RV565_PANEL_320X240,
 * the 2.0" panel measured in the paper.
 *
 * Only RV565_PANEL_320X240 has been verified on hardware; the other presets
 * use the offsets commonly published for those modules.
 */
#ifndef RV565_PANEL_H
#define RV565_PANEL_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint16_t width;     /* visible pixels, after rotation */
    uint16_t height;
    uint16_t x_offset;  /* first visible column in controller memory */
    uint16_t y_offset;  /* first visible row */
    uint8_t  madctl;    /* memory access control: rotation and mirroring */
    uint8_t  invert;    /* 1 for IPS panels, which need display inversion */
} rv565_panel_t;

/* Initialisers, e.g. `.panel = RV565_PANEL_240X240`. */
#define RV565_PANEL_320X240 { 320, 240,  0,  0, 0x60, 1 }  /* 2.0", landscape */
#define RV565_PANEL_240X320 { 240, 320,  0,  0, 0x00, 1 }  /* 2.0", portrait */
#define RV565_PANEL_240X240 { 240, 240,  0,  0, 0x00, 1 }  /* 1.3" and 1.54" */
#define RV565_PANEL_135X240 { 135, 240, 52, 40, 0x00, 1 }  /* 1.14", portrait */
#define RV565_PANEL_240X135 { 240, 135, 40, 53, 0x60, 1 }  /* 1.14", landscape */

#ifdef __cplusplus
}
#endif

#endif /* RV565_PANEL_H */
