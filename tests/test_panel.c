/* Host test for the ST7789 panel presets: the default sequence must equal the
 * one measured in the paper, and each preset must open the right window. */
#include <stdio.h>
#include <string.h>

#include "port/st7789_init.h"

static int failures;

#define CHECK(cond, ...) do { \
    if (!(cond)) { printf("FAIL: " __VA_ARGS__); printf("\n"); ++failures; } \
} while (0)

/* The 1.0 init table, verbatim. */
static const rv565_st7789_step_t V1_SEQUENCE[] = {
    { 0x01, RV565_ST7789_DELAY | 1, { 150 } },
    { 0x11, RV565_ST7789_DELAY | 1, { 120 } },
    { 0x3A, 1, { 0x55 } },
    { 0x36, 1, { 0x60 } },
    { 0xB2, 5, { 0x0C, 0x0C, 0x00, 0x33, 0x33 } },
    { 0xC6, 1, { 0x0F } },
    { 0xC0, 1, { 0x2C } },
    { 0xC2, 1, { 0x01 } },
    { 0xC3, 1, { 0x12 } },
    { 0xC4, 1, { 0x20 } },
    { 0xBB, 1, { 0x20 } },
    { 0x2A, 4, { 0x00, 0x00, 0x01, 0x3F } },
    { 0x2B, 4, { 0x00, 0x00, 0x00, 0xEF } },
    { 0x21, 0, { 0 } },
    { 0x13, 0, { 0 } },
    { 0x29, RV565_ST7789_DELAY | 1, { 20 } },
};

static const rv565_st7789_step_t *find(const rv565_st7789_step_t *steps, size_t n, uint8_t cmd)
{
    for (size_t i = 0; i < n; ++i) {
        if (steps[i].cmd == cmd) return &steps[i];
    }
    return NULL;
}

static unsigned word(const uint8_t *b) { return (unsigned)b[0] << 8 | b[1]; }

static void check_default(const char *name, const rv565_panel_t *panel)
{
    rv565_st7789_step_t steps[RV565_ST7789_STEPS];
    size_t n = rv565_st7789_sequence(panel, steps);
    CHECK(n == sizeof(V1_SEQUENCE) / sizeof(V1_SEQUENCE[0]), "%s: %zu steps", name, n);
    for (size_t i = 0; i < n; ++i) {
        const rv565_st7789_step_t *a = &steps[i], *b = &V1_SEQUENCE[i];
        size_t len = b->len & RV565_ST7789_DELAY ? 1 : b->len;
        CHECK(a->cmd == b->cmd && a->len == b->len && memcmp(a->data, b->data, len) == 0,
              "%s: step %zu differs from 1.0 (cmd 0x%02X)", name, i, b->cmd);
    }
}

static void check_window(const char *name, rv565_panel_t p)
{
    rv565_st7789_step_t steps[RV565_ST7789_STEPS];
    size_t n = rv565_st7789_sequence(&p, steps);
    const rv565_st7789_step_t *caset = find(steps, n, 0x2A);
    const rv565_st7789_step_t *raset = find(steps, n, 0x2B);
    const rv565_st7789_step_t *madctl = find(steps, n, 0x36);
    CHECK(caset && raset && madctl, "%s: missing window or MADCTL", name);
    if (!caset || !raset || !madctl) return;
    CHECK(word(caset->data) == p.x_offset &&
          word(caset->data + 2) == p.x_offset + p.width - 1u, "%s: columns", name);
    CHECK(word(raset->data) == p.y_offset &&
          word(raset->data + 2) == p.y_offset + p.height - 1u, "%s: rows", name);
    CHECK(madctl->data[0] == p.madctl, "%s: MADCTL", name);
    CHECK(find(steps, n, (uint8_t)(p.invert ? 0x21 : 0x20)) != NULL, "%s: inversion", name);
    /* The window must stay inside the controller's 240x320 memory. */
    int landscape = (p.madctl & 0x20) != 0;
    unsigned mem_w = landscape ? 320u : 240u, mem_h = landscape ? 240u : 320u;
    CHECK(p.x_offset + p.width <= mem_w && p.y_offset + p.height <= mem_h,
          "%s: window exceeds controller memory", name);
}

int main(void)
{
    const rv565_panel_t zero = { 0, 0, 0, 0, 0, 0 };
    const rv565_panel_t p320x240 = RV565_PANEL_320X240;
    check_default("NULL panel", NULL);
    check_default("zeroed panel", &zero);
    check_default("RV565_PANEL_320X240", &p320x240);

    const struct { const char *name; rv565_panel_t panel; } presets[] = {
        { "RV565_PANEL_320X240", RV565_PANEL_320X240 },
        { "RV565_PANEL_240X320", RV565_PANEL_240X320 },
        { "RV565_PANEL_240X240", RV565_PANEL_240X240 },
        { "RV565_PANEL_135X240", RV565_PANEL_135X240 },
        { "RV565_PANEL_240X135", RV565_PANEL_240X135 },
    };
    for (size_t i = 0; i < sizeof(presets) / sizeof(presets[0]); ++i) {
        check_window(presets[i].name, presets[i].panel);
    }

    const rv565_panel_t no_invert = { 240, 240, 0, 80, 0xC0, 0 };
    check_window("custom, no inversion", no_invert);

    if (failures) {
        printf("%d panel check(s) failed\n", failures);
        return 1;
    }
    printf("panel checks passed (%zu presets)\n", sizeof(presets) / sizeof(presets[0]));
    return 0;
}
