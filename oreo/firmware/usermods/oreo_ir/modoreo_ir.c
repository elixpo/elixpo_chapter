// Hardware-timed IR envelope receiver for OreoOS on ESP32-S3.
//
// The TSOP38238 demodulates the optical carrier and drives GPIO18 low during
// each carrier burst. ESP-IDF RMT records that envelope at 1 us resolution,
// independently of MicroPython, display flushes, and garbage collection.
//
// Checked against ESP-IDF v5.5.1, components/esp_driver_rmt/src/rmt_rx.c and
// rmt_common.c (the version the badge firmware is built with).
//
// Glitch filter limit (issue #48, the "RMT RX arm failed" error)
// ---------------------------------------------------------------
// rmt_receive() validates signal_range_min_ns against the RX glitch filter
// before it touches the channel state:
//
//     filter_reg = filter_clock_resolution_hz * signal_range_min_ns / 1e9
//     filter_reg must be <= RMT_LL_MAX_FILTER_VALUE (255 on the S3)
//
// rmt_new_rx_channel() sets filter_clock_resolution_hz to the RMT *group*
// clock (only the ESP32 and S2 use APB instead). The S3 has a shared group
// prescaler (SOC_RMT_CHANNEL_CLK_INDEPENDENT is not set), and
// s_rmt_set_group_prescale() picks the highest group clock that still
// reaches the channel resolution: 80 MHz APB / 1, then /80 per channel for
// 1 MHz. The filter therefore counts at 80 MHz and the longest accepted value
// is 255 / 80 MHz = 3187 ns. Firmware before v2.0.0 asked for 20 us, a
// register value of 1600, so every rmt_receive() returned ESP_ERR_INVALID_ARG
// and the badge showed "RMT RX arm failed: ESP_ERR_INVALID_ARG" (cut to
// "RX: RMT RX ... failed: ESP_ERR_IN..." on screen). The TSOP already removes
// the carrier and real IR marks are hundreds of microseconds long, so a ~3 us
// filter rejects pin noise without touching data. If another channel set a
// faster group clock first, arming steps down to 1 us and then to no filter.
// Those checks run before rmt_receive() changes the channel state, so
// retrying with a smaller value is safe.
//
// Lifecycle
// ---------
//   stopped --start()--> listening --stop()--> stopped
//   listening: the channel is enabled and one rmt_receive() is pending; the
//              done callback (ISR) only flags the frame, poll() copies it out
//              and re-arms from task context (never from the ISR).
//   stuck:     rmt_del_channel() failed. The channel and its symbol buffer
//              are kept (the hardware may still own the buffer) and every
//              later start()/stop() retries the deletion first.
// start() on a listening receiver is a no-op and stop() on a stopped one is
// too. The buffer is freed only after rmt_del_channel() succeeded.
//
// Serial diagnostics: _oreo_ir.debug(True) prints each transition, the
// channel id, DMA on/off and every ESP-IDF error code to the console.

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "py/mpprint.h"
#include "py/runtime.h"

#include "driver/gpio.h"
#include "driver/rmt_rx.h"
#include "esp_private/rmt.h"
#include "esp_err.h"
#include "esp_heap_caps.h"

#define OREO_IR_RESOLUTION_HZ (1000000U)
#define OREO_IR_MAX_SYMBOLS   (512U)
// DMA mode: size of the DMA staging block. Non-DMA mode: on-chip RMT RAM.
// The S3 has 48 words per block and the channel must own a whole number of
// blocks, so 48 claims exactly one block and leaves room for the TX channel.
// Ping-pong RX keeps frames longer than one block intact.
#define OREO_IR_DMA_SYMBOLS   (64U)
#define OREO_IR_MEM_SYMBOLS   (48U)
// 25 ms of silence ends a frame: 25000 ticks at 1 MHz, below the 32767 limit.
#define OREO_IR_IDLE_NS       (25000000U)

// Glitch filter candidates, longest first (see the header comment).
static const uint32_t s_min_ns_steps[] = {3000U, 1000U, 0U};
#define OREO_IR_MIN_STEPS (sizeof(s_min_ns_steps) / sizeof(s_min_ns_steps[0]))

typedef enum {
    OREO_IR_STOPPED = 0,
    OREO_IR_LISTENING,
    OREO_IR_STUCK,
} oreo_ir_state_t;

static const char *const s_state_names[] = {"stopped", "listening", "stuck"};

static rmt_channel_handle_t s_rx_channel;
static rmt_symbol_word_t *s_symbols;
static volatile size_t s_symbol_count;
static volatile bool s_frame_ready;
static volatile uint32_t s_frames;
static oreo_ir_state_t s_state = OREO_IR_STOPPED;
static bool s_with_dma;
static bool s_debug;
static int s_channel_id = -1;
static int s_rx_gpio = -1;
static const char *s_last_stage = "idle";
static esp_err_t s_last_err = ESP_OK;
// Why the DMA path was skipped on the last start (NULL stage: it was not).
static const char *s_dma_stage;
static esp_err_t s_dma_err = ESP_OK;
// Channels created and deleted since boot; opens - closes is the number of
// live RX channels and must stay 0 or 1 (leak check for the tab-cycle test).
static uint32_t s_opens;
static uint32_t s_closes;

static rmt_receive_config_t s_receive_config = {
    .signal_range_min_ns = 3000U,
    .signal_range_max_ns = OREO_IR_IDLE_NS,
};

// Task context only: mp_printf must never run from the RMT/GDMA ISR.
#define OREO_IR_LOG(...) do { \
        if (s_debug) { \
            mp_printf(&mp_plat_print, "[ir] "); \
            mp_printf(&mp_plat_print, __VA_ARGS__); \
            mp_printf(&mp_plat_print, "\n"); \
        } \
} while (0)

static NORETURN void oreo_ir_raise(esp_err_t err, const char *stage) {
    s_last_stage = stage;
    s_last_err = err;
    OREO_IR_LOG("FAIL %s: %s (0x%x) dma=%d ch=%d filter=%uns state=%s",
        stage, esp_err_to_name(err), (unsigned int)err, (int)s_with_dma,
        s_channel_id, (unsigned int)s_receive_config.signal_range_min_ns,
        s_state_names[s_state]);
    if (s_dma_stage != NULL && !s_with_dma) {
        mp_raise_msg_varg(&mp_type_OSError,
            MP_ERROR_TEXT("%s failed: %s (0x%x) [dma=0 filter=%uns gpio=%d]; "
                "DMA path skipped: %s failed: %s"),
            stage, esp_err_to_name(err), (unsigned int)err,
            (unsigned int)s_receive_config.signal_range_min_ns, s_rx_gpio,
            s_dma_stage, esp_err_to_name(s_dma_err));
    }
    mp_raise_msg_varg(&mp_type_OSError,
        MP_ERROR_TEXT("%s failed: %s (0x%x) [dma=%d filter=%uns gpio=%d state=%s]"),
        stage, esp_err_to_name(err), (unsigned int)err, (int)s_with_dma,
        (unsigned int)s_receive_config.signal_range_min_ns, s_rx_gpio,
        s_state_names[s_state]);
}

static bool IRAM_ATTR oreo_ir_rx_done(
    rmt_channel_handle_t channel,
    const rmt_rx_done_event_data_t *event,
    void *context
) {
    (void)channel;
    (void)context;
    // Only flag the frame. The driver already moved the channel back to the
    // enable state; poll() copies the symbols and re-arms in task context.
    s_symbol_count = event->num_symbols;
    s_frame_ready = true;
    s_frames++;
    return false;
}

static esp_err_t oreo_ir_arm(void) {
    s_symbol_count = 0;
    s_frame_ready = false;
    return rmt_receive(
        s_rx_channel,
        s_symbols,
        OREO_IR_MAX_SYMBOLS * sizeof(rmt_symbol_word_t),
        &s_receive_config
    );
}

// First arm on a fresh channel: walk the glitch filter down until the driver
// accepts it. Only ESP_ERR_INVALID_ARG is retried; rmt_receive() returns it
// before changing the channel state, so the retry is safe. Buffer problems
// fail on every step and report the last error.
static esp_err_t oreo_ir_arm_first(void) {
    esp_err_t err = ESP_ERR_INVALID_ARG;
    for (size_t i = 0; i < OREO_IR_MIN_STEPS; ++i) {
        s_receive_config.signal_range_min_ns = s_min_ns_steps[i];
        err = oreo_ir_arm();
        OREO_IR_LOG("arm filter=%uns -> %s", (unsigned int)s_min_ns_steps[i],
            esp_err_to_name(err));
        if (err != ESP_ERR_INVALID_ARG) {
            break;
        }
    }
    return err;
}

// Disable and delete the channel. The symbol buffer is left alone: it is
// freed only once the channel is gone, so RMT/DMA can never write into
// released memory. On failure the receiver is "stuck" and keeps both.
static esp_err_t oreo_ir_close_channel(void) {
    if (s_rx_channel == NULL) {
        return ESP_OK;
    }
    // rmt_disable() accepts ENABLE and RUN (a pending receive) and reports
    // ESP_ERR_INVALID_STATE for a channel that never got enabled; only the
    // deletion decides whether the buffer is released.
    esp_err_t disable_err = rmt_disable(s_rx_channel);
    esp_err_t delete_err = rmt_del_channel(s_rx_channel);
    OREO_IR_LOG("close ch=%d dma=%d: disable=%s delete=%s", s_channel_id,
        (int)s_with_dma, esp_err_to_name(disable_err), esp_err_to_name(delete_err));
    if (delete_err != ESP_OK) {
        s_state = OREO_IR_STUCK;
        return delete_err;
    }
    s_rx_channel = NULL;
    s_channel_id = -1;
    s_closes++;
    return ESP_OK;
}

static esp_err_t oreo_ir_stop_internal(void) {
    esp_err_t err = oreo_ir_close_channel();
    if (err != ESP_OK) {
        return err;
    }
    if (s_symbols != NULL) {
        heap_caps_free(s_symbols);
        s_symbols = NULL;
    }
    s_symbol_count = 0;
    s_frame_ready = false;
    if (s_state != OREO_IR_STOPPED) {
        OREO_IR_LOG("state %s -> stopped", s_state_names[s_state]);
    }
    s_state = OREO_IR_STOPPED;
    s_rx_gpio = -1;
    return ESP_OK;
}

// Create, hook up, enable and arm one RX channel. On failure the channel is
// deleted again (s_rx_channel is NULL afterwards unless the receiver is
// stuck) and *stage names the step that failed.
static esp_err_t oreo_ir_open_channel(int pin, bool with_dma, const char **stage) {
    rmt_rx_channel_config_t channel_config = {
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = OREO_IR_RESOLUTION_HZ,
        .mem_block_symbols = with_dma ? OREO_IR_DMA_SYMBOLS : OREO_IR_MEM_SYMBOLS,
        .gpio_num = (gpio_num_t)pin,
        .flags.with_dma = with_dma,
    };
    rmt_channel_handle_t channel = NULL;
    s_with_dma = with_dma;
    *stage = "RMT RX channel";
    // On failure the driver frees everything it allocated (rmt_rx_destroy).
    esp_err_t err = rmt_new_rx_channel(&channel_config, &channel);
    if (err != ESP_OK) {
        OREO_IR_LOG("new channel dma=%d gpio=%d -> %s", (int)with_dma, pin,
            esp_err_to_name(err));
        return err;
    }
    s_rx_channel = channel;
    s_opens++;
    if (rmt_get_channel_id(channel, &s_channel_id) != ESP_OK) {
        s_channel_id = -1;
    }
    OREO_IR_LOG("new channel ch=%d dma=%d gpio=%d (live=%u)", s_channel_id,
        (int)with_dma, pin, (unsigned int)(s_opens - s_closes));
    // rmt_new_rx_channel() already enables the input and its pull-up; keep
    // the TSOP open-collector output pulled up so an idle line reads HIGH.
    gpio_set_pull_mode((gpio_num_t)pin, GPIO_PULLUP_ONLY);

    rmt_rx_event_callbacks_t callbacks = {
        .on_recv_done = oreo_ir_rx_done,
    };
    *stage = "RMT RX callback";
    err = rmt_rx_register_event_callbacks(channel, &callbacks, NULL);
    if (err == ESP_OK) {
        *stage = "RMT RX enable";
        err = rmt_enable(channel);
    }
    if (err == ESP_OK) {
        *stage = "RMT RX arm";
        err = oreo_ir_arm_first();
    }
    if (err != ESP_OK) {
        // A failed close leaves the channel (and the buffer) in place and the
        // receiver stuck; the caller must not open a second channel then.
        oreo_ir_close_channel();
    }
    return err;
}

static mp_obj_t oreo_ir_start(mp_obj_t pin_obj) {
    int pin = mp_obj_get_int(pin_obj);
    if (!GPIO_IS_VALID_GPIO(pin)) {
        mp_raise_ValueError(MP_ERROR_TEXT("invalid IR RX GPIO"));
    }

    // App redraws and tab transitions can request the same receiver twice.
    // Treat that as success instead of tearing down a live transaction.
    if (s_state == OREO_IR_LISTENING && s_rx_gpio == pin && s_rx_channel != NULL) {
        OREO_IR_LOG("start gpio=%d: already listening on ch=%d", pin, s_channel_id);
        return mp_const_none;
    }

    // Also retries the deletion of a stuck channel.
    esp_err_t err = oreo_ir_stop_internal();
    if (err != ESP_OK) {
        oreo_ir_raise(err, "RMT RX cleanup");
    }
    s_dma_stage = NULL;
    s_dma_err = ESP_OK;
    s_last_err = ESP_OK;
    s_rx_gpio = pin;

    // Internal, DMA-capable and 64-byte aligned: rmt_receive() rejects a
    // buffer outside internal RAM in DMA mode ([IDF-8997], PSRAM is not
    // supported; with CONFIG_SPIRAM_USE_MALLOC a plain malloc of this size
    // could land in PSRAM). 512 words (2 KiB) fits the two DMA descriptors the
    // driver allocates (2 x 4092 bytes).
    s_symbols = heap_caps_aligned_calloc(
        64,
        OREO_IR_MAX_SYMBOLS,
        sizeof(rmt_symbol_word_t),
        MALLOC_CAP_8BIT | MALLOC_CAP_INTERNAL | MALLOC_CAP_DMA
    );
    if (s_symbols == NULL) {
        s_rx_gpio = -1;
        mp_raise_msg(&mp_type_MemoryError, MP_ERROR_TEXT("IR RX buffer (2 KiB internal DMA RAM)"));
    }

    gpio_set_pull_mode((gpio_num_t)pin, GPIO_PULLUP_ONLY);

    // DMA first. Only the last RX channel (channel 7, RX id 3) can use DMA and
    // it needs a free GDMA RX channel, so fall back to the on-chip ping-pong
    // path whenever the DMA attempt fails at any stage, unless that attempt
    // left a channel behind. Timing is hardware-exact either way.
    const char *stage = "RMT RX channel";
    err = oreo_ir_open_channel(pin, true, &stage);
    if (err != ESP_OK && s_rx_channel == NULL) {
        s_dma_stage = stage;
        s_dma_err = err;
        OREO_IR_LOG("DMA path failed at %s: %s; trying on-chip RAM",
            stage, esp_err_to_name(err));
        err = oreo_ir_open_channel(pin, false, &stage);
    }
    if (err != ESP_OK) {
        if (s_rx_channel == NULL) {
            oreo_ir_stop_internal();
            s_rx_gpio = pin;   // keep the pin in the error text
        }
        oreo_ir_raise(err, stage);
    }

    s_state = OREO_IR_LISTENING;
    s_last_stage = "listening";
    s_last_err = ESP_OK;
    OREO_IR_LOG("state stopped -> listening ch=%d dma=%d filter=%uns gpio=%d",
        s_channel_id, (int)s_with_dma,
        (unsigned int)s_receive_config.signal_range_min_ns, pin);
    return mp_const_none;
}
static MP_DEFINE_CONST_FUN_OBJ_1(oreo_ir_start_obj, oreo_ir_start);

static mp_obj_t oreo_ir_stop(void) {
    esp_err_t err = oreo_ir_stop_internal();
    if (err != ESP_OK) {
        oreo_ir_raise(err, "RMT RX stop");
    }
    s_last_stage = "idle";
    return mp_const_none;
}
static MP_DEFINE_CONST_FUN_OBJ_0(oreo_ir_stop_obj, oreo_ir_stop);

static mp_obj_t oreo_ir_poll(void) {
    if (s_state != OREO_IR_LISTENING || !s_frame_ready) {
        return mp_const_none;
    }

    size_t symbol_count = s_symbol_count;
    if (symbol_count > OREO_IR_MAX_SYMBOLS) {
        symbol_count = OREO_IR_MAX_SYMBOLS;
    }

    // The TSOP is idle HIGH and marks are LOW. Drop any leading idle segment,
    // then return alternating mark/space durations independent of pin polarity.
    mp_obj_t *durations = m_new(mp_obj_t, symbol_count * 2 + 1);
    size_t duration_count = 0;
    bool found_mark = false;
    for (size_t i = 0; i < symbol_count; ++i) {
        const rmt_symbol_word_t symbol = s_symbols[i];
        const uint16_t widths[2] = {symbol.duration0, symbol.duration1};
        const uint8_t levels[2] = {symbol.level0, symbol.level1};
        for (size_t part = 0; part < 2; ++part) {
            uint16_t width = widths[part];
            if (width == 0) {
                continue;
            }
            if (!found_mark) {
                if (levels[part] != 0) {
                    continue;
                }
                found_mark = true;
            }
            durations[duration_count++] = mp_obj_new_int_from_uint(width);
        }
    }

    // Copy out before re-arming: the next transaction writes into s_symbols.
    // The driver set the channel back to the enable state before calling
    // oreo_ir_rx_done, so this rmt_receive() is legal.
    s_frame_ready = false;
    s_symbol_count = 0;
    esp_err_t err = oreo_ir_arm();
    if (err != ESP_OK) {
        m_del(mp_obj_t, durations, symbol_count * 2 + 1);
        oreo_ir_stop_internal();
        oreo_ir_raise(err, "RMT RX rearm");
    }

    if (duration_count == 0) {
        m_del(mp_obj_t, durations, symbol_count * 2 + 1);
        return mp_const_none;
    }
    OREO_IR_LOG("frame %u: %u symbols, %u durations", (unsigned int)s_frames,
        (unsigned int)symbol_count, (unsigned int)duration_count);
    mp_obj_t result = mp_obj_new_tuple(duration_count, durations);
    m_del(mp_obj_t, durations, symbol_count * 2 + 1);
    return result;
}
static MP_DEFINE_CONST_FUN_OBJ_0(oreo_ir_poll_obj, oreo_ir_poll);

static mp_obj_t oreo_ir_active(void) {
    return mp_obj_new_bool(s_state == OREO_IR_LISTENING);
}
static MP_DEFINE_CONST_FUN_OBJ_0(oreo_ir_active_obj, oreo_ir_active);

// debug() -> bool; debug(flag) turns serial lifecycle logging on or off.
static mp_obj_t oreo_ir_debug(size_t n_args, const mp_obj_t *args) {
    if (n_args == 1) {
        s_debug = mp_obj_is_true(args[0]);
    }
    return mp_obj_new_bool(s_debug);
}
static MP_DEFINE_CONST_FUN_OBJ_VAR_BETWEEN(oreo_ir_debug_obj, 0, 1, oreo_ir_debug);

static mp_obj_t oreo_ir_str(const char *s) {
    if (s == NULL) {
        return mp_const_none;
    }
    return mp_obj_new_str(s, strlen(s));
}

// Diagnostics for the Quest app and serial debugging:
// (active, gpio, dma, filter_ns, stage, last_error_name,
//  channel_id, state, frames, dma_skip_stage, dma_skip_error_name,
//  channels_opened, channels_closed)
// The first six fields keep their old meaning.
static mp_obj_t oreo_ir_info(void) {
    mp_obj_t items[13] = {
        mp_obj_new_bool(s_state == OREO_IR_LISTENING),
        mp_obj_new_int(s_rx_gpio),
        mp_obj_new_bool(s_with_dma),
        mp_obj_new_int_from_uint(s_receive_config.signal_range_min_ns),
        oreo_ir_str(s_last_stage),
        oreo_ir_str(esp_err_to_name(s_last_err)),
        mp_obj_new_int(s_channel_id),
        oreo_ir_str(s_state_names[s_state]),
        mp_obj_new_int_from_uint(s_frames),
        oreo_ir_str(s_dma_stage),
        s_dma_stage != NULL ? oreo_ir_str(esp_err_to_name(s_dma_err)) : mp_const_none,
        mp_obj_new_int_from_uint(s_opens),
        mp_obj_new_int_from_uint(s_closes),
    };
    return mp_obj_new_tuple(13, items);
}
static MP_DEFINE_CONST_FUN_OBJ_0(oreo_ir_info_obj, oreo_ir_info);

static const mp_rom_map_elem_t oreo_ir_module_globals_table[] = {
    {MP_ROM_QSTR(MP_QSTR___name__), MP_ROM_QSTR(MP_QSTR__oreo_ir)},
    {MP_ROM_QSTR(MP_QSTR_start), MP_ROM_PTR(&oreo_ir_start_obj)},
    {MP_ROM_QSTR(MP_QSTR_stop), MP_ROM_PTR(&oreo_ir_stop_obj)},
    {MP_ROM_QSTR(MP_QSTR_poll), MP_ROM_PTR(&oreo_ir_poll_obj)},
    {MP_ROM_QSTR(MP_QSTR_active), MP_ROM_PTR(&oreo_ir_active_obj)},
    {MP_ROM_QSTR(MP_QSTR_info), MP_ROM_PTR(&oreo_ir_info_obj)},
    {MP_ROM_QSTR(MP_QSTR_debug), MP_ROM_PTR(&oreo_ir_debug_obj)},
};
static MP_DEFINE_CONST_DICT(oreo_ir_module_globals, oreo_ir_module_globals_table);

const mp_obj_module_t oreo_ir_module = {
    .base = {&mp_type_module},
    .globals = (mp_obj_dict_t *)&oreo_ir_module_globals,
};

MP_REGISTER_MODULE(MP_QSTR__oreo_ir, oreo_ir_module);
