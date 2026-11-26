# Falera Badge: ESP32-S3 N16R8 (16 MB flash, 8 MB octal PSRAM).
# ESP32_GENERIC_S3 with its SPIRAM_OCT variant, plus the Falera Badge identity
# (USB names, board name, hostname) and a 16 MiB flash layout.
set(IDF_TARGET esp32s3)

# The partition table path in sdkconfig is relative to ports/esp32, which an
# out-of-tree board cannot use, so it is written here as an absolute path.
set(OREO_PARTITIONS_SDKCONFIG ${CMAKE_BINARY_DIR}/sdkconfig.oreo_partitions)
file(WRITE ${OREO_PARTITIONS_SDKCONFIG}
    "CONFIG_PARTITION_TABLE_CUSTOM_FILENAME=\"${MICROPY_BOARD_DIR}/partitions-oreo-badge.csv\"\n")

set(SDKCONFIG_DEFAULTS
    boards/sdkconfig.base
    boards/sdkconfig.ble
    boards/sdkconfig.spiram_sx
    ${MICROPY_BOARD_DIR}/sdkconfig.board
    boards/sdkconfig.240mhz
    boards/sdkconfig.spiram_oct
    ${OREO_PARTITIONS_SDKCONFIG}
)
