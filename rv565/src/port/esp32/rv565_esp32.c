#include "rv565_esp32.h"

#if RV565_PORT_ESP32

#include <string.h>

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

#include "../st7789_init.h"

#define WORKER_STACK (24 * 1024)

static struct {
    spi_device_handle_t dev;
    rv565_esp32_display_config_t cfg;
    spi_transaction_t slots[2]; /* one per in-flight stripe */
    int next_slot;
} disp;

static void poll_bytes(const void *data, size_t length)
{
    spi_transaction_t t = { .length = length * 8, .tx_buffer = data };
    spi_device_polling_transmit(disp.dev, &t);
}

static void command(uint8_t cmd, const uint8_t *data, size_t length)
{
    gpio_set_level(disp.cfg.pin_cs, 0);
    gpio_set_level(disp.cfg.pin_dc, 0);
    poll_bytes(&cmd, 1);
    if (data != NULL && length != 0) {
        gpio_set_level(disp.cfg.pin_dc, 1);
        poll_bytes(data, length);
    }
    gpio_set_level(disp.cfg.pin_cs, 1);
}

static void begin_frame(void *ctx)
{
    (void)ctx;
    const uint8_t ramwr = RV565_ST7789_RAMWR;
    gpio_set_level(disp.cfg.pin_cs, 0);
    gpio_set_level(disp.cfg.pin_dc, 0);
    poll_bytes(&ramwr, 1);
    gpio_set_level(disp.cfg.pin_dc, 1);
}

static void queue_stripe(void *ctx, const uint8_t *data, size_t length)
{
    (void)ctx;
    spi_transaction_t *t = &disp.slots[disp.next_slot];
    disp.next_slot ^= 1;
    memset(t, 0, sizeof(*t));
    t->length = length * 8;
    t->tx_buffer = data;
    spi_device_queue_trans(disp.dev, t, portMAX_DELAY);
}

static void wait_stripe(void *ctx)
{
    (void)ctx;
    spi_transaction_t *done = NULL;
    spi_device_get_trans_result(disp.dev, &done, portMAX_DELAY);
}

static void end_frame(void *ctx)
{
    (void)ctx;
    gpio_set_level(disp.cfg.pin_cs, 1);
}

rv565_status_t rv565_esp32_display_init(const rv565_esp32_display_config_t *cfg,
                                        rv565_display_ops_t *ops)
{
    if (cfg == NULL || ops == NULL) {
        return RV565_ERR_ARG;
    }
    disp.cfg = *cfg;
    disp.next_slot = 0;

    uint64_t mask = (1ULL << cfg->pin_cs) | (1ULL << cfg->pin_dc);
    if (cfg->pin_rst >= 0) mask |= 1ULL << cfg->pin_rst;
    if (cfg->pin_bl >= 0) mask |= 1ULL << cfg->pin_bl;
    const gpio_config_t outputs = { .pin_bit_mask = mask, .mode = GPIO_MODE_OUTPUT };
    if (gpio_config(&outputs) != ESP_OK) {
        return RV565_ERR_ARG;
    }
    gpio_set_level(cfg->pin_cs, 1);
    if (cfg->pin_bl >= 0) gpio_set_level(cfg->pin_bl, 0);

    const spi_bus_config_t bus = {
        .mosi_io_num = cfg->pin_mosi,
        .miso_io_num = -1,
        .sclk_io_num = cfg->pin_sclk,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = (int)cfg->max_stripe_bytes,
    };
    if (spi_bus_initialize((spi_host_device_t)cfg->host, &bus, SPI_DMA_CH_AUTO) != ESP_OK) {
        return RV565_ERR_ARG;
    }
    const spi_device_interface_config_t dev = {
        .clock_speed_hz = cfg->clock_hz,
        .mode = 0,
        .spics_io_num = -1,
        .queue_size = 2,
        .flags = SPI_DEVICE_HALFDUPLEX,
    };
    if (spi_bus_add_device((spi_host_device_t)cfg->host, &dev, &disp.dev) != ESP_OK) {
        return RV565_ERR_ARG;
    }

    if (cfg->pin_rst >= 0) {
        gpio_set_level(cfg->pin_rst, 1);
        vTaskDelay(pdMS_TO_TICKS(10));
        gpio_set_level(cfg->pin_rst, 0);
        vTaskDelay(pdMS_TO_TICKS(10));
        gpio_set_level(cfg->pin_rst, 1);
        vTaskDelay(pdMS_TO_TICKS(120));
    }
    rv565_st7789_step_t steps[RV565_ST7789_STEPS];
    const size_t count = rv565_st7789_sequence(&cfg->panel, steps);
    for (size_t i = 0; i < count; ++i) {
        const rv565_st7789_step_t *s = &steps[i];
        if (s->len & RV565_ST7789_DELAY) {
            command(s->cmd, NULL, 0);
            vTaskDelay(pdMS_TO_TICKS(s->data[0]));
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

void rv565_esp32_backlight(int on)
{
    if (disp.cfg.pin_bl >= 0) {
        gpio_set_level(disp.cfg.pin_bl, on ? 1 : 0);
    }
}

uint32_t rv565_esp32_micros(void)
{
    return (uint32_t)esp_timer_get_time();
}

/* Inflate worker -------------------------------------------------------- */

typedef struct { uint16_t index; uint8_t *dst; size_t len; } job_t;
typedef struct { rv565_status_t status; uint32_t inflate_us; } result_t;

static struct {
    const rv565_clip_t *clip;
    QueueHandle_t jobs;
    QueueHandle_t results;
} work;

static void worker(void *arg)
{
    (void)arg;
    job_t job;
    for (;;) {
        xQueueReceive(work.jobs, &job, portMAX_DELAY);
        const uint32_t start = rv565_esp32_micros();
        result_t r;
        r.status = rv565_decode_frame(work.clip, job.index, job.dst, job.len);
        r.inflate_us = rv565_esp32_micros() - start;
        xQueueSend(work.results, &r, portMAX_DELAY);
    }
}

static void dec_start(void *ctx, uint16_t index, uint8_t *dst, size_t len)
{
    (void)ctx;
    const job_t job = { index, dst, len };
    xQueueSend(work.jobs, &job, portMAX_DELAY);
}

static rv565_status_t dec_finish(void *ctx, uint32_t *inflate_us)
{
    (void)ctx;
    result_t r;
    xQueueReceive(work.results, &r, portMAX_DELAY);
    if (inflate_us != NULL) {
        *inflate_us = r.inflate_us;
    }
    return r.status;
}

rv565_status_t rv565_esp32_decoder_init(const rv565_clip_t *clip, int core,
                                        rv565_decoder_ops_t *ops)
{
    if (clip == NULL || ops == NULL) {
        return RV565_ERR_ARG;
    }
    work.clip = clip;
    work.jobs = xQueueCreate(1, sizeof(job_t));
    work.results = xQueueCreate(1, sizeof(result_t));
    if (work.jobs == NULL || work.results == NULL ||
            xTaskCreatePinnedToCore(worker, "rv565_inflate", WORKER_STACK, NULL,
                                    configMAX_PRIORITIES - 2, NULL, core) != pdPASS) {
        return RV565_ERR_ARG;
    }
    ops->ctx = NULL;
    ops->start = dec_start;
    ops->finish = dec_finish;
    return RV565_OK;
}

#endif /* RV565_PORT_ESP32 */
