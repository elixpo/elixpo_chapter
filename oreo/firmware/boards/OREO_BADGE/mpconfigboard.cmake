# Oreo Badge: ESP32-S3 N16R8 (16 MB flash, 8 MB octal PSRAM).
# Same configuration as MicroPython's ESP32_GENERIC_S3 board with its
# SPIRAM_OCT variant, so flash layout and behaviour are unchanged; the board
# only adds the Oreo Badge identity (USB names, board name, hostname).
set(IDF_TARGET esp32s3)

set(SDKCONFIG_DEFAULTS
    boards/sdkconfig.base
    boards/sdkconfig.ble
    boards/sdkconfig.spiram_sx
    ${MICROPY_BOARD_DIR}/sdkconfig.board
    boards/sdkconfig.240mhz
    boards/sdkconfig.spiram_oct
)
