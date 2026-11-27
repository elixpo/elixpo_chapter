#include "rv565_rp2.h"

#if RV565_PORT_RP2

#include "hardware/dma.h"
#include "hardware/gpio.h"
#include "hardware/spi.h"
#include "pico/multicore.h"
#include "pico/time.h"

#include "../st7789_init.h"

#define CORE1_STACK_WORDS (24 * 1024 / 4) /* tinfl keeps ~11 KB on the stack */
#define RV565_RP2_COMMAND_HZ (10u * 1000u * 1000u)
#define WINDOW_ROWS    1
#define WINDOW_COLUMNS 2

static struct {
    spi_inst_t *spi;
    rv565_rp2_display_config_t cfg;
    unsigned command_hz;
    int dma;
    int windowed;      /* WINDOW_ROWS | WINDOW_COLUMNS set; restored before full writes */
} disp;

static void spi_bytes(const uint8_t *data, size_t length)
{
    spi_write_blocking(disp.spi, data, length);
}

static void command(uint8_t cmd, const uint8_t *data, size_t length)
{
    gpio_put(disp.cfg.pin_cs, 0);
    gpio_put(disp.cfg.pin_dc, 0);
    spi_bytes(&cmd, 1);
    if (data != NULL && length != 0) {
        gpio_put(disp.cfg.pin_dc, 1);
        spi_bytes(data, length);
    }
    gpio_put(disp.cfg.pin_cs, 1);
}

/* Commands at the safe rate: an optional CASET and RASET, then RAMWR; pixel
 * data follows at the full rate. */
static void start_write(const uint8_t *caset, const uint8_t *raset)
{
    const uint8_t ramwr = RV565_ST7789_RAMWR;
    spi_set_baudrate(disp.spi, disp.command_hz);
    if (caset != NULL) {
        command(RV565_ST7789_CASET, caset, 4);
    }
    if (raset != NULL) {
        command(RV565_ST7789_RASET, raset, 4);
    }
    gpio_put(disp.cfg.pin_cs, 0);
    gpio_put(disp.cfg.pin_dc, 0);
    spi_bytes(&ramwr, 1);
    gpio_put(disp.cfg.pin_dc, 1);
    spi_set_baudrate(disp.spi, (unsigned)disp.cfg.clock_hz);
}

/* CASET restoring the full column window after a region update, or NULL. */
static const uint8_t *full_columns(uint8_t caset[4])
{
    if (!(disp.windowed & WINDOW_COLUMNS)) {
        return NULL;
    }
    rv565_st7789_columns(&disp.cfg.panel, 0, rv565_panel_resolve(&disp.cfg.panel).width, caset);
    disp.windowed &= ~WINDOW_COLUMNS;
    return caset;
}

static void begin_frame(void *ctx)
{
    (void)ctx;
    uint8_t caset[4], raset[4];
    const uint8_t *cols = full_columns(caset);
    if (disp.windowed & WINDOW_ROWS) {
        rv565_st7789_rows(&disp.cfg.panel, 0, rv565_panel_resolve(&disp.cfg.panel).height, raset);
        disp.windowed &= ~WINDOW_ROWS;
        start_write(cols, raset);
    } else {
        start_write(cols, NULL);
    }
}

/* Partial update: only rows first .. first + rows - 1 (full width). */
static void begin_rows(void *ctx, uint16_t first, uint16_t rows)
{
    (void)ctx;
    uint8_t caset[4], raset[4];
    const uint8_t *cols = full_columns(caset);
    rv565_st7789_rows(&disp.cfg.panel, first, rows, raset);
    disp.windowed |= WINDOW_ROWS;
    start_write(cols, raset);
}

/* Region update: columns x .. x + w - 1 of rows y .. y + h - 1. */
static void begin_window(void *ctx, uint16_t x, uint16_t y, uint16_t w, uint16_t h)
{
    (void)ctx;
    uint8_t caset[4], raset[4];
    rv565_st7789_columns(&disp.cfg.panel, x, w, caset);
    rv565_st7789_rows(&disp.cfg.panel, y, h, raset);
    disp.windowed = WINDOW_ROWS | WINDOW_COLUMNS;
    start_write(caset, raset);
}

/* The player keeps at most one stripe in flight when it queues the next, so
 * a single DMA channel paced by the SPI TX request is enough. */
static void queue_stripe(void *ctx, const uint8_t *data, size_t length)
{
    (void)ctx;
    dma_channel_set_read_addr(disp.dma, data, false);
    dma_channel_set_trans_count(disp.dma, length, true);
}

static void wait_stripe(void *ctx)
{
    (void)ctx;
    dma_channel_wait_for_finish_blocking(disp.dma);
}

static void end_frame(void *ctx)
{
    (void)ctx;
    /* DMA completion means the FIFO accepted the bytes; wait for the wire. */
    while (spi_is_busy(disp.spi)) {
        tight_loop_contents();
    }
    gpio_put(disp.cfg.pin_cs, 1);
}

static void init_output(int pin, int level)
{
    if (pin < 0) return;
    gpio_init(pin);
    gpio_set_dir(pin, GPIO_OUT);
    gpio_put(pin, level);
}

rv565_status_t rv565_rp2_display_init(const rv565_rp2_display_config_t *cfg,
                                      rv565_display_ops_t *ops)
{
    if (cfg == NULL || ops == NULL || (cfg->spi_index != 0 && cfg->spi_index != 1)) {
        return RV565_ERR_ARG;
    }
    disp.cfg = *cfg;
    disp.spi = cfg->spi_index == 0 ? spi0 : spi1;
    disp.windowed = 0;

    /* Command bytes (the init sequence and each frame's RAMWR) go out at a
     * safe rate: at tens of MHz the panel misreads them, measured on a Pico 2.
     * Pixel data runs at the full rate. */
    disp.command_hz = cfg->clock_hz < RV565_RP2_COMMAND_HZ
        ? (unsigned)cfg->clock_hz : RV565_RP2_COMMAND_HZ;
    spi_init(disp.spi, disp.command_hz);
    spi_set_format(disp.spi, 8, SPI_CPOL_1, SPI_CPHA_1, SPI_MSB_FIRST);
    gpio_set_function(cfg->pin_mosi, GPIO_FUNC_SPI);
    gpio_set_function(cfg->pin_sclk, GPIO_FUNC_SPI);
    init_output(cfg->pin_cs, 1);
    init_output(cfg->pin_dc, 1);
    init_output(cfg->pin_rst, 1);
    init_output(cfg->pin_bl, 0);

    disp.dma = dma_claim_unused_channel(true);
    dma_channel_config c = dma_channel_get_default_config(disp.dma);
    channel_config_set_transfer_data_size(&c, DMA_SIZE_8);
    channel_config_set_read_increment(&c, true);
    channel_config_set_write_increment(&c, false);
    channel_config_set_dreq(&c, spi_get_dreq(disp.spi, true));
    dma_channel_configure(disp.dma, &c, &spi_get_hw(disp.spi)->dr, NULL, 0, false);

    if (cfg->pin_rst >= 0) {
        gpio_put(cfg->pin_rst, 1);
        sleep_ms(10);
        gpio_put(cfg->pin_rst, 0);
        sleep_ms(10);
        gpio_put(cfg->pin_rst, 1);
        sleep_ms(120);
    }
    rv565_st7789_step_t steps[RV565_ST7789_STEPS];
    const size_t count = rv565_st7789_sequence(&cfg->panel, steps);
    for (size_t i = 0; i < count; ++i) {
        const rv565_st7789_step_t *s = &steps[i];
        if (s->len & RV565_ST7789_DELAY) {
            command(s->cmd, NULL, 0);
            sleep_ms(s->data[0]);
        } else {
            command(s->cmd, s->data, s->len);
        }
    }
    spi_set_baudrate(disp.spi, (unsigned)cfg->clock_hz);

    ops->ctx = NULL;
    ops->begin_frame = begin_frame;
    ops->queue_stripe = queue_stripe;
    ops->wait_stripe = wait_stripe;
    ops->end_frame = end_frame;
    ops->begin_rows = begin_rows;
    ops->begin_window = begin_window;
    return RV565_OK;
}

void rv565_rp2_backlight(int on)
{
    if (disp.cfg.pin_bl >= 0) {
        gpio_put(disp.cfg.pin_bl, on ? 1 : 0);
    }
}

uint32_t rv565_rp2_micros(void)
{
    return time_us_32();
}

/* Inflate worker on core 1 ---------------------------------------------- */

static uint32_t core1_stack[CORE1_STACK_WORDS];

static struct {
    const rv565_clip_t *clip;
    volatile uint16_t index;
    const uint8_t *volatile prev;
    uint8_t *volatile dst;
    volatile size_t len;
    volatile rv565_status_t status;
    volatile uint32_t inflate_us;
} work;

static void core1_main(void)
{
    for (;;) {
        (void)multicore_fifo_pop_blocking();
        const uint32_t start = time_us_32();
        /* The player passes prev != dst, so no scratch buffer is needed. */
        work.status = rv565_decode(work.clip, work.index, work.prev, work.dst, work.len, NULL, 0);
        work.inflate_us = time_us_32() - start;
        __dmb();
        multicore_fifo_push_blocking(1);
    }
}

static void dec_start(void *ctx, uint16_t index, const uint8_t *prev, uint8_t *dst, size_t len)
{
    (void)ctx;
    work.index = index;
    work.prev = prev;
    work.dst = dst;
    work.len = len;
    __dmb();
    multicore_fifo_push_blocking(1);
}

static rv565_status_t dec_finish(void *ctx, uint32_t *inflate_us)
{
    (void)ctx;
    (void)multicore_fifo_pop_blocking();
    __dmb();
    if (inflate_us != NULL) {
        *inflate_us = work.inflate_us;
    }
    return work.status;
}

rv565_status_t rv565_rp2_decoder_init(const rv565_clip_t *clip, rv565_decoder_ops_t *ops)
{
    if (clip == NULL || ops == NULL) {
        return RV565_ERR_ARG;
    }
    work.clip = clip;
    multicore_launch_core1_with_stack(core1_main, core1_stack, sizeof(core1_stack));
    ops->ctx = NULL;
    ops->start = dec_start;
    ops->finish = dec_finish;
    ops->decode = NULL;
    return RV565_OK;
}

#endif /* RV565_PORT_RP2 */
