// Falera Badge (Elixpo): ESP32-S3 N16R8 conference badge running FaleraOS.
// https://falera.elixpo.com

#define MICROPY_HW_BOARD_NAME               "Falera Badge"
#define MICROPY_HW_MCU_NAME                 "ESP32S3"
#define MICROPY_PY_NETWORK_HOSTNAME_DEFAULT "falera"

// How the badge introduces itself over USB: Espressif's VID with the PID
// Espressif allocated to the badge (espressif/usb-pids#425).
#define MICROPY_HW_USB_VID                  (0x303A)
#define MICROPY_HW_USB_PID                  (0x83EC)
#define MICROPY_HW_USB_MANUFACTURER_STRING  "Elixpo"
#define MICROPY_HW_USB_PRODUCT_FS_STRING    "Falera Badge"

// As ESP32_GENERIC_S3: UART REPL stays available alongside native USB.
#define MICROPY_HW_ENABLE_UART_REPL         (1)

// I2C bus shared by the on-board MPU-6050 IMU (oreoWare/pins.py).
#define MICROPY_HW_I2C0_SCL                 (47)
#define MICROPY_HW_I2C0_SDA                 (42)
