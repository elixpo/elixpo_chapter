// SPDX-License-Identifier: MIT
// Native boot splash player for OreoOS on ESP32-S3.
//
// oreoOS/splash.py draws the first splash frame itself, then hands the
// greeting band to this player: an RV565 version 7 clip of the band
// (oreoOS/splash.rv565, tools/build_splash_clip.py) played by a FreeRTOS
// task on core 0, the core MicroPython does not run on (MP_TASK_COREID is 1
// on the dual-core S3). The task never takes the interpreter lock and never
// touches the MicroPython heap: the clip is copied into its own buffer
// (splash_load), so boot's imports, garbage collection and radio start-up
// cannot stall it, and a soft reset cannot free memory under it.
//
// Panel and SPI hand-off
// ----------------------
// Python's oreoWare.display owns the ST7789 through machine.SPI(1), which is
// ESP-IDF SPI2_HOST with one device and no hardware chip select: CS and DC
// are plain GPIOs driven by machine.Pin. The player adds a second device on
// the same, already initialised bus (spi_bus_add_device; the bus itself is
// never initialised, freed or reconfigured here) and drives the same CS and
// DC GPIOs with gpio_set_level, without reconfiguring them. Each frame's
// writes happen inside spi_device_acquire_bus()/release, so they never
// interleave with a machine.SPI transfer at the bus level. The panel is never
// reset or re-initialised: the player only sets row windows (RASET), the
// loader's column window (CASET), and RAMWR, and restores the full-screen
// window (0..319, 0..239) after every frame, which is what present() expects.
// The contract on the Python side: between splash_start() and splash_stop()
// nothing else draws (oreoOS/splash.py stops its own animation; boot draws
// nothing until finish()). As a guard, oreoWare.display.Display() and
// oreoOS.hostui stop a player that is still running (after a crash or a soft
// reset), and the player stops itself after `life` ms.
//
// Frames: frame 0 (a keyframe) is sent whole, then each frame is decoded in
// place (rv565_decode with the previous frame and a scratch buffer) and only
// its changed rows (rv565_changed_lines) are sent, through two internal DMA
// bounce buffers; repeats send nothing. The loader bar under the band is
// drawn here too (Python cannot draw while the player owns the panel), from
// the same formula as splash.loader_frac(), with the target and the
// finish time Python reports through splash_progress().
//
// splash_stop(buf, at_rest) stops after a frame at rest (the word still,
// when (frame % period) < hold) or at once, copies the last frame the panel
// shows into buf (Python's framebuffer rows of the band) and returns the
// loader width on screen, so Python's framebuffer matches the panel exactly
// for the swipe into the OS.

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "py/mperrno.h"
#include "py/mphal.h"
#include "py/runtime.h"

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "freertos/idf_additions.h"   // xTaskCreatePinnedToCore

#include "oreo_splash.h"
#include "rv565/rv565.h"

#define PANEL_W        (320)
#define PANEL_H        (240)
#define ROW_BYTES      (PANEL_W * 2)
#define DMA_ROWS       (6)                    // 3840 bytes: under the 4092-byte
#define DMA_BYTES      (DMA_ROWS * ROW_BYTES) // default max transfer of the bus
#define MAX_RUNS       (32)
// tinfl in ROM keeps its ~11 KB decompressor on the caller's stack.
#define TASK_STACK     (20 * 1024)
#define TASK_PRIO      (5)                    // under Wi-Fi, BT, lwIP, esp_timer

#define ST_CASET       (0x2A)
#define ST_RASET       (0x2B)
#define ST_RAMWR       (0x2C)

typedef enum {
    STOP_NONE = 0,
    STOP_AT_REST,
    STOP_NOW,
} stop_req_t;

static struct {
    // Clip, owned by this module (splash_load).
    uint8_t *clip_buf;
    size_t clip_size;
    size_t clip_filled;
    // Player.
    rv565_clip_t clip;
    uint32_t *index;
    uint8_t *frame;
    uint8_t *scratch;
    size_t frame_bytes;
    uint8_t *dma[2];
    spi_transaction_t trans[2];
    spi_device_handle_t dev;
    TaskHandle_t task;
    SemaphoreHandle_t done;
    esp_timer_handle_t timer;
    bool have_player;             // buffers allocated, results not collected
    // Configuration.
    int pin_cs, pin_dc;
    uint16_t band_y, band_h;
    uint16_t period, hold;
    uint16_t bar_x, bar_y, bar_w, bar_h;
    uint8_t bar_track[2], bar_fill[2];
    int32_t t0_ms, min_total_ms, fill_ms, life_ms;
    int64_t start_us;
    // Shared with Python (32-bit stores are atomic on the S3).
    volatile float target;
    volatile int32_t done_ms;     // finish() time in splash ms, -1 until then
    volatile int stop_req;
    volatile int64_t stop_req_us;
    volatile bool running;
    volatile int bar_px;
    volatile int last_frame;
    volatile uint32_t frames_shown;
    volatile uint32_t late;
    volatile uint32_t worst_us;
    volatile int err;
} S;

// -- panel I/O (task context, bus acquired) -----------------------------------

static void tx_small(const uint8_t *data, size_t len) {
    spi_transaction_t t;
    memset(&t, 0, sizeof(t));
    t.flags = SPI_TRANS_USE_TXDATA;
    t.length = len * 8;
    memcpy(t.tx_data, data, len);
    spi_device_polling_transmit(S.dev, &t);
}

static void command(uint8_t cmd, const uint8_t *data, size_t len) {
    gpio_set_level(S.pin_cs, 0);
    gpio_set_level(S.pin_dc, 0);
    tx_small(&cmd, 1);
    if (len) {
        gpio_set_level(S.pin_dc, 1);
        tx_small(data, len);
    }
    gpio_set_level(S.pin_cs, 1);
}

static void window(uint8_t cmd, uint16_t a, uint16_t b) {
    const uint8_t w[4] = {(uint8_t)(a >> 8), (uint8_t)a, (uint8_t)(b >> 8), (uint8_t)b};
    command(cmd, w, 4);
}

static void start_ramwr(void) {
    const uint8_t c = ST_RAMWR;
    gpio_set_level(S.pin_cs, 0);
    gpio_set_level(S.pin_dc, 0);
    tx_small(&c, 1);
    gpio_set_level(S.pin_dc, 1);
}

// Band rows first .. first + count - 1 of the decoded frame, full width.
static void send_rows(uint16_t first, uint16_t count) {
    window(ST_RASET, S.band_y + first, S.band_y + first + count - 1);
    start_ramwr();
    const uint8_t *src = S.frame + (size_t)first * ROW_BYTES;
    size_t left = (size_t)count * ROW_BYTES;
    int slot = 0, inflight = 0;
    spi_transaction_t *done;
    while (left) {
        size_t n = left < DMA_BYTES ? left : DMA_BYTES;
        if (inflight == 2) {
            spi_device_get_trans_result(S.dev, &done, portMAX_DELAY);
            inflight--;
        }
        memcpy(S.dma[slot], src, n);
        spi_transaction_t *t = &S.trans[slot];
        memset(t, 0, sizeof(*t));
        t->length = n * 8;
        t->tx_buffer = S.dma[slot];
        spi_device_queue_trans(S.dev, t, portMAX_DELAY);
        inflight++;
        slot ^= 1;
        src += n;
        left -= n;
    }
    while (inflight) {
        spi_device_get_trans_result(S.dev, &done, portMAX_DELAY);
        inflight--;
    }
    gpio_set_level(S.pin_cs, 1);
}

static void draw_bar(int px) {
    uint8_t *row = S.dma[0];
    for (int x = 0; x < S.bar_w; x++) {
        const uint8_t *c = x < px ? S.bar_fill : S.bar_track;
        row[2 * x] = c[0];
        row[2 * x + 1] = c[1];
    }
    window(ST_CASET, S.bar_x, S.bar_x + S.bar_w - 1);
    window(ST_RASET, S.bar_y, S.bar_y + S.bar_h - 1);
    start_ramwr();
    for (int r = 0; r < S.bar_h; r++) {
        spi_transaction_t t;
        memset(&t, 0, sizeof(t));
        t.length = (size_t)S.bar_w * 16;
        t.tx_buffer = row;
        spi_device_polling_transmit(S.dev, &t);
    }
    gpio_set_level(S.pin_cs, 1);
    window(ST_CASET, 0, PANEL_W - 1);
}

// splash.loader_frac(): follow the clock towards min_total but never past
// the boot's target; after finish() (done_ms) run to full over fill_ms.
static int bar_px_at(int32_t t) {
    float f = (float)t / (float)S.min_total_ms;
    float target = S.target;
    if (f > target) {
        f = target;
    }
    int32_t d = S.done_ms;
    if (d >= 0) {
        float g = (float)(t - d) / (float)S.fill_ms;
        if (g > 1.0f) {
            g = 1.0f;
        }
        f = f + (1.0f - f) * g;
    }
    if (f < 0.0f) {
        f = 0.0f;
    } else if (f > 1.0f) {
        f = 1.0f;
    }
    return (int)((float)S.bar_w * f);
}

static int32_t splash_ms(int64_t now_us) {
    return S.t0_ms + (int32_t)((now_us - S.start_us) / 1000);
}

// -- the player task ----------------------------------------------------------

static void timer_cb(void *arg) {
    (void)arg;
    TaskHandle_t t = S.task;
    if (t != NULL) {
        xTaskNotifyGive(t);
    }
}

static void splash_task(void *arg) {
    (void)arg;
    const uint16_t n = S.clip.header.frames;
    const int64_t period_us = 1000000 / S.clip.header.fps;
    int64_t deadline = esp_timer_get_time();
    uint16_t i = 0;
    bool whole = true;              // frame 0 of the first loop: send it all
    rv565_line_run_t runs[MAX_RUNS];

    for (;;) {
        const int64_t t_work = esp_timer_get_time();
        rv565_status_t st = rv565_decode(&S.clip, i, S.frame, S.frame, S.frame_bytes,
                                         S.scratch, S.frame_bytes);
        if (st != RV565_OK) {
            S.err = st;
            break;
        }
        size_t count = 0;
        if (whole || rv565_changed_lines(&S.clip, i, runs, MAX_RUNS, &count) != RV565_OK) {
            runs[0].first = 0;
            runs[0].count = S.band_h;
            count = 1;
            whole = false;
        }
        const int px = bar_px_at(splash_ms(t_work));
        if (count || px != S.bar_px) {
            spi_device_acquire_bus(S.dev, portMAX_DELAY);
            if (count) {
                window(ST_CASET, 0, PANEL_W - 1);
            }
            for (size_t r = 0; r < count; r++) {
                send_rows(runs[r].first, runs[r].count);
            }
            if (px != S.bar_px) {
                draw_bar(px);
                S.bar_px = px;
            }
            window(ST_RASET, 0, PANEL_H - 1);
            spi_device_release_bus(S.dev);
        }
        S.last_frame = i;
        S.frames_shown++;

        const int64_t now = esp_timer_get_time();
        const uint32_t work = (uint32_t)(now - t_work);
        if (work > S.worst_us) {
            S.worst_us = work;
        }
        const int req = S.stop_req;
        if (req == STOP_NOW) {
            break;
        }
        if (req == STOP_AT_REST) {
            // At rest, or the word never came to rest within two words' time.
            if ((i % S.period) < S.hold ||
                now - S.stop_req_us > 2 * (int64_t)S.period * period_us) {
                break;
            }
        }
        if (splash_ms(now) >= S.life_ms) {
            break;
        }

        deadline += period_us;
        if (deadline <= now) {
            S.late++;
            deadline = now;         // behind: carry on from now, never skip
            vTaskDelay(1);          // and let lower-priority tasks (idle) run
        } else {
            ulTaskNotifyTake(pdTRUE, 0);
            esp_timer_start_once(S.timer, (uint64_t)(deadline - now));
            ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
            esp_timer_stop(S.timer);
        }
        i = (uint16_t)((i + 1) % n);
    }

    spi_bus_remove_device(S.dev);
    S.dev = NULL;
    S.running = false;
    xSemaphoreGive(S.done);
    vTaskDelete(NULL);
}

// -- resources ----------------------------------------------------------------

static void *alloc_big(size_t n) {
    void *p = heap_caps_malloc(n, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (p == NULL) {
        p = heap_caps_malloc(n, MALLOC_CAP_8BIT);
    }
    return p;
}

static void free_player(void) {
    heap_caps_free(S.index);
    heap_caps_free(S.frame);
    heap_caps_free(S.scratch);
    heap_caps_free(S.dma[0]);
    heap_caps_free(S.dma[1]);
    S.index = NULL;
    S.frame = NULL;
    S.scratch = NULL;
    S.dma[0] = S.dma[1] = NULL;
    if (S.timer != NULL) {
        esp_timer_delete(S.timer);
        S.timer = NULL;
    }
    S.have_player = false;
}

static void free_clip(void) {
    heap_caps_free(S.clip_buf);
    S.clip_buf = NULL;
    S.clip_size = 0;
    S.clip_filled = 0;
}

// Ask the task to stop and wait (without the GIL) for it to finish. Returns
// false if it is still running after the timeout.
static bool stop_task(int req, uint32_t timeout_ms) {
    if (!S.running) {
        return true;
    }
    // The task checks the request after every frame, so it sees it within
    // one frame period; it is not notified (it may be exiting, and its
    // handle would then be stale).
    S.stop_req_us = esp_timer_get_time();
    S.stop_req = req;
    BaseType_t ok;
    MP_THREAD_GIL_EXIT();
    ok = xSemaphoreTake(S.done, pdMS_TO_TICKS(timeout_ms));
    if (ok != pdTRUE && req != STOP_NOW) {
        S.stop_req = STOP_NOW;
        ok = xSemaphoreTake(S.done, pdMS_TO_TICKS(500));
    }
    MP_THREAD_GIL_ENTER();
    if (ok != pdTRUE) {
        return false;
    }
    S.task = NULL;
    return true;
}

// -- Python API -----------------------------------------------------------------

// splash_load(data, offset, total): copy part of the clip into the module's
// own buffer; offset 0 (re)allocates it for `total` bytes.
static mp_obj_t oreo_splash_load(mp_obj_t data_obj, mp_obj_t offset_obj, mp_obj_t total_obj) {
    if (S.running) {
        mp_raise_msg(&mp_type_OSError, MP_ERROR_TEXT("splash is playing"));
    }
    mp_buffer_info_t data;
    mp_get_buffer_raise(data_obj, &data, MP_BUFFER_READ);
    const mp_int_t offset = mp_obj_get_int(offset_obj);
    const mp_int_t total = mp_obj_get_int(total_obj);
    if (offset == 0) {
        if (S.have_player) {
            free_player();
        }
        free_clip();
        if (total <= 0) {
            mp_raise_ValueError(MP_ERROR_TEXT("empty splash clip"));
        }
        S.clip_buf = alloc_big((size_t)total);
        if (S.clip_buf == NULL) {
            mp_raise_OSError(MP_ENOMEM);
        }
        S.clip_size = (size_t)total;
    }
    if (S.clip_buf == NULL || total != (mp_int_t)S.clip_size || offset < 0 ||
        (size_t)offset + data.len > S.clip_size) {
        mp_raise_ValueError(MP_ERROR_TEXT("splash clip chunk out of range"));
    }
    memcpy(S.clip_buf + offset, data.buf, data.len);
    if ((size_t)offset + data.len > S.clip_filled) {
        S.clip_filled = (size_t)offset + data.len;
    }
    return mp_const_none;
}
MP_DEFINE_CONST_FUN_OBJ_3(oreo_splash_load_obj, oreo_splash_load);

static NORETURN void start_fail(const char *what, int code) {
    free_player();
    mp_raise_msg_varg(&mp_type_OSError, MP_ERROR_TEXT("splash %s (%d)"), what, code);
}

static mp_obj_t oreo_splash_start(size_t n_args, const mp_obj_t *pos_args, mp_map_t *kw_args) {
    enum {
        ARG_y, ARG_period, ARG_hold, ARG_bar, ARG_track, ARG_fill, ARG_bar_px,
        ARG_t0, ARG_min_total, ARG_fill_ms, ARG_life, ARG_cs, ARG_dc, ARG_spi,
        ARG_baud, ARG_core,
    };
    static const mp_arg_t allowed[] = {
        { MP_QSTR_y,         MP_ARG_REQUIRED | MP_ARG_INT, {.u_int = 0} },
        { MP_QSTR_period,    MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 1} },
        { MP_QSTR_hold,      MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 1} },
        { MP_QSTR_bar,       MP_ARG_KW_ONLY | MP_ARG_OBJ,  {.u_obj = MP_OBJ_NULL} },
        { MP_QSTR_track,     MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 0} },
        { MP_QSTR_fill,      MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 0xFFFF} },
        { MP_QSTR_bar_px,    MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 0} },
        { MP_QSTR_t0,        MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 0} },
        { MP_QSTR_min_total, MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 4000} },
        { MP_QSTR_fill_ms,   MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 300} },
        { MP_QSTR_life,      MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 12000} },
        { MP_QSTR_cs,        MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 14} },
        { MP_QSTR_dc,        MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 15} },
        { MP_QSTR_spi,       MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 1} },
        { MP_QSTR_baud,      MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 40000000} },
        { MP_QSTR_core,      MP_ARG_KW_ONLY | MP_ARG_INT,  {.u_int = 0} },
    };
    mp_arg_val_t a[MP_ARRAY_SIZE(allowed)];
    mp_arg_parse_all(n_args, pos_args, kw_args, MP_ARRAY_SIZE(allowed), allowed, a);

    if (S.running && !stop_task(STOP_NOW, 500)) {
        mp_raise_msg(&mp_type_OSError, MP_ERROR_TEXT("splash still playing"));
    }
    if (S.have_player) {
        free_player();
    }
    if (S.clip_buf == NULL || S.clip_filled != S.clip_size) {
        mp_raise_ValueError(MP_ERROR_TEXT("splash clip not loaded"));
    }

    rv565_header_t h;
    rv565_status_t st = rv565_parse_header(S.clip_buf, S.clip_size, PANEL_W, PANEL_H, &h);
    if (st != RV565_OK) {
        mp_raise_msg_varg(&mp_type_ValueError, MP_ERROR_TEXT("splash clip: %s"), rv565_strerror(st));
    }
    const mp_int_t y = a[ARG_y].u_int;
    if (h.width != PANEL_W || h.pixel_format != RV565_PIXEL_RGB565BE ||
        y < 0 || y + h.height > PANEL_H) {
        mp_raise_ValueError(MP_ERROR_TEXT("splash clip does not fit the panel"));
    }
    mp_int_t bar[4] = {0, 0, 0, 0};
    if (a[ARG_bar].u_obj != MP_OBJ_NULL && a[ARG_bar].u_obj != mp_const_none) {
        mp_obj_t *items;
        mp_obj_get_array_fixed_n(a[ARG_bar].u_obj, 4, &items);
        for (int k = 0; k < 4; k++) {
            bar[k] = mp_obj_get_int(items[k]);
        }
    }
    if (bar[0] < 0 || bar[1] < 0 || bar[2] < 0 || bar[3] < 0 ||
        bar[0] + bar[2] > PANEL_W || bar[1] + bar[3] > PANEL_H || bar[2] * 2 > DMA_BYTES) {
        mp_raise_ValueError(MP_ERROR_TEXT("splash loader out of range"));
    }
    const mp_int_t period = a[ARG_period].u_int;
    const mp_int_t core = a[ARG_core].u_int;
    const mp_int_t spi_id = a[ARG_spi].u_int;
    if (period < 1 || a[ARG_hold].u_int < 0 || a[ARG_min_total].u_int < 1 ||
        a[ARG_fill_ms].u_int < 1 || core < 0 || core > 1 || (spi_id != 1 && spi_id != 2)) {
        mp_raise_ValueError(MP_ERROR_TEXT("invalid splash argument"));
    }

    S.index = heap_caps_malloc((size_t)h.frames * sizeof(uint32_t), MALLOC_CAP_8BIT);
    if (S.index == NULL) {
        start_fail("out of memory", 0);
    }
    st = rv565_open(&S.clip, S.clip_buf, S.clip_size, S.index, h.frames, PANEL_W, PANEL_H);
    if (st != RV565_OK) {
        free_player();
        mp_raise_msg_varg(&mp_type_ValueError, MP_ERROR_TEXT("splash clip: %s"), rv565_strerror(st));
    }
    S.frame_bytes = rv565_frame_bytes(&S.clip.header);
    S.frame = alloc_big(S.frame_bytes);
    S.scratch = alloc_big(S.frame_bytes);
    S.dma[0] = heap_caps_malloc(DMA_BYTES, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    S.dma[1] = heap_caps_malloc(DMA_BYTES, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    if (S.frame == NULL || S.scratch == NULL || S.dma[0] == NULL || S.dma[1] == NULL) {
        start_fail("out of memory", 0);
    }
    S.have_player = true;

    S.pin_cs = a[ARG_cs].u_int;
    S.pin_dc = a[ARG_dc].u_int;
    S.band_y = (uint16_t)y;
    S.band_h = h.height;
    S.period = (uint16_t)period;
    S.hold = (uint16_t)a[ARG_hold].u_int;
    S.bar_x = (uint16_t)bar[0];
    S.bar_y = (uint16_t)bar[1];
    S.bar_w = (uint16_t)bar[2];
    S.bar_h = (uint16_t)bar[3];
    const mp_int_t track = a[ARG_track].u_int, fill = a[ARG_fill].u_int;
    S.bar_track[0] = (uint8_t)(track >> 8);
    S.bar_track[1] = (uint8_t)track;
    S.bar_fill[0] = (uint8_t)(fill >> 8);
    S.bar_fill[1] = (uint8_t)fill;
    S.bar_px = (int)a[ARG_bar_px].u_int;
    S.t0_ms = (int32_t)a[ARG_t0].u_int;
    S.min_total_ms = (int32_t)a[ARG_min_total].u_int;
    S.fill_ms = (int32_t)a[ARG_fill_ms].u_int;
    S.life_ms = (int32_t)a[ARG_life].u_int;
    S.target = 0.0f;
    S.done_ms = -1;
    S.stop_req = STOP_NONE;
    S.last_frame = -1;
    S.frames_shown = 0;
    S.late = 0;
    S.worst_us = 0;
    S.err = 0;

    if (S.done == NULL) {
        S.done = xSemaphoreCreateBinary();
        if (S.done == NULL) {
            start_fail("out of memory", 0);
        }
    }
    xSemaphoreTake(S.done, 0);
    const esp_timer_create_args_t targs = {
        .callback = timer_cb,
        .name = "oreo_splash",
    };
    esp_err_t err = esp_timer_create(&targs, &S.timer);
    if (err != ESP_OK) {
        start_fail("timer", err);
    }
    const spi_device_interface_config_t dev = {
        .clock_speed_hz = (int)a[ARG_baud].u_int,
        .mode = 0,
        .spics_io_num = -1,
        .queue_size = 2,
    };
    err = spi_bus_add_device(spi_id == 1 ? SPI2_HOST : SPI3_HOST, &dev, &S.dev);
    if (err != ESP_OK) {
        S.dev = NULL;
        start_fail("SPI device", err);
    }
    S.start_us = esp_timer_get_time();
    S.running = true;
    if (xTaskCreatePinnedToCore(splash_task, "oreo_splash", TASK_STACK, NULL, TASK_PRIO,
            &S.task, (BaseType_t)core) != pdPASS) {
        S.running = false;
        S.task = NULL;
        spi_bus_remove_device(S.dev);
        S.dev = NULL;
        start_fail("task", 0);
    }
    return mp_const_none;
}
MP_DEFINE_CONST_FUN_OBJ_KW(oreo_splash_start_obj, 1, oreo_splash_start);

// splash_progress(target[, done_ms]): the loader's target (0..1, it only
// grows) and, once finish() starts, its time in splash ms.
static mp_obj_t oreo_splash_progress(size_t n_args, const mp_obj_t *args) {
    float target = (float)mp_obj_get_float(args[0]);
    if (target > S.target) {
        S.target = target > 1.0f ? 1.0f : target;
    }
    if (n_args > 1) {
        S.done_ms = (int32_t)mp_obj_get_int(args[1]);
    }
    return mp_const_none;
}
MP_DEFINE_CONST_FUN_OBJ_VAR_BETWEEN(oreo_splash_progress_obj, 1, 2, oreo_splash_progress);

static mp_obj_t stats_tuple(void) {
    mp_obj_t t[5] = {
        mp_obj_new_int(S.bar_px),
        mp_obj_new_int_from_uint(S.frames_shown),
        mp_obj_new_int_from_uint(S.late),
        mp_obj_new_int_from_uint(S.worst_us),
        mp_obj_new_int(S.err),
    };
    return mp_obj_new_tuple(5, t);
}

// splash_stop(buf=None, at_rest=False, timeout_ms=1000): stop the player
// (after a frame at rest if at_rest), copy the frame on the panel into buf,
// free everything and return (bar_px, frames, late, worst_us, err), or None
// when no player was started.
static mp_obj_t oreo_splash_stop(size_t n_args, const mp_obj_t *pos_args, mp_map_t *kw_args) {
    enum { ARG_buf, ARG_at_rest, ARG_timeout };
    static const mp_arg_t allowed[] = {
        { MP_QSTR_buf,        MP_ARG_OBJ,  {.u_obj = mp_const_none} },
        { MP_QSTR_at_rest,    MP_ARG_BOOL, {.u_bool = false} },
        { MP_QSTR_timeout_ms, MP_ARG_INT,  {.u_int = 1000} },
    };
    mp_arg_val_t a[MP_ARRAY_SIZE(allowed)];
    mp_arg_parse_all(n_args, pos_args, kw_args, MP_ARRAY_SIZE(allowed), allowed, a);

    if (!S.have_player) {
        free_clip();
        return mp_const_none;
    }
    mp_int_t timeout = a[ARG_timeout].u_int;
    if (!stop_task(a[ARG_at_rest].u_bool ? STOP_AT_REST : STOP_NOW,
            timeout < 1 ? 1 : (uint32_t)timeout)) {
        mp_raise_OSError(MP_ETIMEDOUT);
    }
    if (a[ARG_buf].u_obj != mp_const_none && S.last_frame >= 0) {
        mp_buffer_info_t buf;
        mp_get_buffer_raise(a[ARG_buf].u_obj, &buf, MP_BUFFER_WRITE);
        memcpy(buf.buf, S.frame, buf.len < S.frame_bytes ? buf.len : S.frame_bytes);
    }
    mp_obj_t result = stats_tuple();
    free_player();
    free_clip();
    return result;
}
MP_DEFINE_CONST_FUN_OBJ_KW(oreo_splash_stop_obj, 0, oreo_splash_stop);

// splash_state(): (running, frame, bar_px, frames, late, worst_us, err).
static mp_obj_t oreo_splash_state(void) {
    mp_obj_t t[7] = {
        mp_obj_new_bool(S.running),
        mp_obj_new_int(S.last_frame),
        mp_obj_new_int(S.bar_px),
        mp_obj_new_int_from_uint(S.frames_shown),
        mp_obj_new_int_from_uint(S.late),
        mp_obj_new_int_from_uint(S.worst_us),
        mp_obj_new_int(S.err),
    };
    return mp_obj_new_tuple(7, t);
}
MP_DEFINE_CONST_FUN_OBJ_0(oreo_splash_state_obj, oreo_splash_state);
