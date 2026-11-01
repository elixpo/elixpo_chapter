// RV565 on top of LovyanGFX: LovyanGFX drives the panel, RV565 decodes.
//
// The panel is configured in the LGFX class below; change the panel type,
// size, offsets and pins for your module. The values here match the RV565
// badge (ST7789, 2.0" 320x240).
//
// Core 1 inflates the next frame while core 0 scales stripes and LovyanGFX
// sends them by DMA. Replace clip.h with your own video:
//   python3 tools/rv565.py encode input.mp4 clip.rv565
//   python3 tools/rv565.py c-array clip.rv565 clip.h

#if !defined(ARDUINO_ARCH_ESP32)
#error "This example is for ESP32 boards."
#endif

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include <RV565.h>
#include "esp_heap_caps.h"
#include "clip.h"

class LGFX : public lgfx::LGFX_Device {
    lgfx::Panel_ST7789 panel;
    lgfx::Bus_SPI bus;
    lgfx::Light_PWM light;

public:
    LGFX()
    {
        auto b = bus.config();
        b.spi_host = SPI2_HOST;
        b.spi_mode = 0;
        b.freq_write = 40000000;
        b.pin_sclk = 12;
        b.pin_mosi = 11;
        b.pin_miso = -1;
        b.pin_dc = 15;
        b.dma_channel = SPI_DMA_CH_AUTO;
        bus.config(b);
        panel.setBus(&bus);

        auto p = panel.config();
        p.pin_cs = 14;
        p.pin_rst = 16;
        p.panel_width = 240;
        p.panel_height = 320;
        p.offset_x = 0;
        p.offset_y = 0;
        p.invert = true;
        panel.config(p);

        auto l = light.config();
        l.pin_bl = 17;
        light.config(l);
        panel.setLight(&light);

        setPanel(&panel);
    }
};

static const uint16_t STRIPE_ROWS = 24;
static const bool DUAL_CORE = true;

static LGFX lcd;
static rv565_clip_t clip;
static uint32_t frame_index[1024];
static rv565_player_t player;
static rv565_pacer_t pacer;

// Display ops: the player queues one stripe, scales the next, then waits.
static void begin_frame(void *)
{
    lcd.startWrite();
    lcd.setAddrWindow(0, 0, lcd.width(), lcd.height());
}

static void queue_stripe(void *, const uint8_t *data, size_t length)
{
    // swap565_t is big-endian RGB565, the byte order RV565 stripes use.
    lcd.writePixelsDMA((const lgfx::swap565_t *)data, length / 2);
}

static void wait_stripe(void *) { lcd.waitDMA(); }
static void end_frame(void *) { lcd.endWrite(); }

static void fail(const char *what, rv565_status_t st)
{
    Serial.printf("rv565: %s: %s\n", what, rv565_strerror(st));
    for (;;) delay(1000);
}

void setup()
{
    Serial.begin(115200);
    lcd.init();
    lcd.setRotation(1);  // landscape
    lcd.fillScreen(TFT_BLACK);
    lcd.setBrightness(255);

    const uint16_t w = lcd.width(), h = lcd.height();
    rv565_status_t st = rv565_open(&clip, rv565_clip, rv565_clip_size, frame_index, 1024, w, h);
    if (st != RV565_OK) fail("open", st);

    const size_t stripe_bytes = (size_t)w * STRIPE_ROWS * 2;
    const size_t frame_bytes = rv565_frame_bytes(&clip.header);
    player.clip = &clip;
    player.panel_width = w;
    player.panel_height = h;
    player.stripe_rows = STRIPE_ROWS;
    player.xmap = (uint16_t *)malloc(w * sizeof(uint16_t));
    player.ymap = (uint16_t *)malloc(h * sizeof(uint16_t));
    player.micros = rv565_esp32_micros;
    for (int i = 0; i < 2; ++i) {
        player.stripes[i] = (uint8_t *)heap_caps_aligned_alloc(4, stripe_bytes, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    }
    player.frames[0] = (uint8_t *)heap_caps_malloc(frame_bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    player.frames[1] = DUAL_CORE ? (uint8_t *)heap_caps_malloc(frame_bytes, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT) : NULL;

    player.display.ctx = NULL;
    player.display.begin_frame = begin_frame;
    player.display.queue_stripe = queue_stripe;
    player.display.wait_stripe = wait_stripe;
    player.display.end_frame = end_frame;
    if (DUAL_CORE && (st = rv565_esp32_decoder_init(&clip, 1, &player.decoder)) != RV565_OK) fail("decoder", st);
    if ((st = rv565_player_init(&player)) != RV565_OK) fail("player", st);

    rv565_pacer_start(&pacer, &clip.header, rv565_esp32_micros());
}

void loop()
{
    rv565_status_t st = rv565_player_present(&player, pacer.frame, NULL);
    if (st != RV565_OK) fail("present", st);
    uint32_t wait_us;
    rv565_pacer_advance(&pacer, rv565_esp32_micros(), &wait_us);
    if (wait_us) delayMicroseconds(wait_us);
}
