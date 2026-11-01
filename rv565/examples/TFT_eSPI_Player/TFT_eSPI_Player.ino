// RV565 on top of TFT_eSPI: TFT_eSPI drives the panel, RV565 decodes.
//
// Any panel TFT_eSPI supports works, at any size. TFT_eSPI is configured in
// its own User_Setup.h (or with build flags), not in this sketch; for the
// RV565 badge wiring that is:
//
//   #define ST7789_DRIVER
//   #define TFT_WIDTH  240
//   #define TFT_HEIGHT 320
//   #define TFT_MOSI 11
//   #define TFT_SCLK 12
//   #define TFT_CS   14
//   #define TFT_DC   15
//   #define TFT_RST  16
//   #define TFT_BL   17
//   #define TFT_BACKLIGHT_ON HIGH
//   #define SPI_FREQUENCY 40000000
//
// Core 1 inflates the next frame while core 0 scales stripes and TFT_eSPI
// sends them by DMA. Replace clip.h with your own video:
//   python3 tools/rv565.py encode input.mp4 clip.rv565
//   python3 tools/rv565.py c-array clip.rv565 clip.h

#if !defined(ARDUINO_ARCH_ESP32)
#error "This example is for ESP32 boards."
#endif

#include <RV565.h>
#include <TFT_eSPI.h>
#include "esp_heap_caps.h"
#include "clip.h"

static const uint16_t STRIPE_ROWS = 24;
static const bool DUAL_CORE = true;

static TFT_eSPI tft;
static rv565_clip_t clip;
static uint32_t frame_index[1024];
static rv565_player_t player;
static rv565_pacer_t pacer;

// Display ops: the player queues one stripe, scales the next, then waits.
static void begin_frame(void *)
{
    tft.startWrite();
    tft.setAddrWindow(0, 0, tft.width(), tft.height());
}

static void queue_stripe(void *, const uint8_t *data, size_t length)
{
    // Stripes are already big-endian RGB565; setSwapBytes(false) sends them as is.
    tft.pushPixelsDMA((uint16_t *)data, length / 2);
}

static void wait_stripe(void *) { tft.dmaWait(); }
static void end_frame(void *) { tft.endWrite(); }

static void fail(const char *what, rv565_status_t st)
{
    Serial.printf("rv565: %s: %s\n", what, rv565_strerror(st));
    for (;;) delay(1000);
}

void setup()
{
    Serial.begin(115200);
    tft.init();
    tft.setRotation(1);  // landscape
    tft.setSwapBytes(false);
    tft.initDMA();
    tft.fillScreen(TFT_BLACK);

    const uint16_t w = tft.width(), h = tft.height();
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
