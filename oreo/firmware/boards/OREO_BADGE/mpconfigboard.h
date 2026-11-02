// Oreo Badge (Elixpo): ESP32-S3 N16R8 conference badge running OreoOS.
// https://oreo.elixpo.com

#define MICROPY_HW_BOARD_NAME               "Oreo Badge"
#define MICROPY_HW_MCU_NAME                 "ESP32S3"
#define MICROPY_PY_NETWORK_HOSTNAME_DEFAULT "oreo"

// How the badge introduces itself over USB. The VID/PID stay at the
// Espressif TinyUSB defaults for standard CDC serial.
#define MICROPY_HW_USB_MANUFACTURER_STRING  "Elixpo"
#define MICROPY_HW_USB_PRODUCT_FS_STRING    "Oreo Badge"

// As ESP32_GENERIC_S3: UART REPL stays available alongside native USB.
#define MICROPY_HW_ENABLE_UART_REPL         (1)

#define MICROPY_HW_I2C0_SCL                 (9)
#define MICROPY_HW_I2C0_SDA                 (8)
