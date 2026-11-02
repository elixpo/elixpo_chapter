#include "rv565_rp2.h"

#if RV565_PORT_RP2

#include "hardware/dma.h"
#include "hardware/gpio.h"
#include "hardware/spi.h"
#include "pico/multicore.h"
#include "pico/time.h"

#include "../st7789_init.h"

#define CORE1_STACK_WORDS (24 * 1024 / 4) /* tinfl keeps ~11 KB on the stack */

static struct {
    spi_inst_t *spi;
    rv565_rp2_display_config_t cfg;
    int dma;
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

static void begin_frame(void *ctx)
{
    (void)ctx;
    const uint8_t ramwr = RV565_ST7789_RAMWR;
    gpio_put(disp.cfg.pin_cs, 0);
    gpio_put(disp.cfg.pin_dc, 0);
    spi_bytes(&ramwr, 1);
    gpio_put(disp.cfg.pin_dc, 1);
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

    spi_init(disp.spi, (unsigned)cfg->clock_hz);
    spi_set_format(disp.spi, 8, SPI_CPOL_0, SPI_CPHA_0, SPI_MSB_FIRST);
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

    ops->ctx = NULL;
    ops->begin_frame = begin_frame;
    ops->queue_stripe = queue_stripe;
    ops->wait_stripe = wait_stripe;
    ops->end_frame = end_frame;
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
        work.status = rv565_decode_frame(work.clip, work.index, work.dst, work.len);
        work.inflate_us = time_us_32() - start;
        __dmb();
        multicore_fifo_push_blocking(1);
    }
}

static void dec_start(void *ctx, uint16_t index, uint8_t *dst, size_t len)
{
    (void)ctx;
    work.index = index;
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
    return RV565_OK;
}

#endif /* RV565_PORT_RP2 */
