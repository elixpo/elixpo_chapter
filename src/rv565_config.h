/* RV565 build configuration: platform detection and feature switches.
 * Every switch can be overridden with a compiler definition. */
#ifndef RV565_CONFIG_H
#define RV565_CONFIG_H

/* ESP-IDF and Arduino-ESP32 both define ESP_PLATFORM. */
#if !defined(RV565_PORT_ESP32) && defined(ESP_PLATFORM)
#define RV565_PORT_ESP32 1
#endif

/* Pico SDK builds pass RV565_PORT_RP2 from CMake; Arduino-Pico defines
 * ARDUINO_ARCH_RP2040 for both RP2040 and RP2350 boards. */
#if !defined(RV565_PORT_RP2) && defined(ARDUINO_ARCH_RP2040)
#define RV565_PORT_RP2 1
#endif

#ifndef RV565_PORT_ESP32
#define RV565_PORT_ESP32 0
#endif
#ifndef RV565_PORT_RP2
#define RV565_PORT_RP2 0
#endif

/* ESP32-family chips carry miniz's tinfl in ROM; every other target uses the
 * bundled copy in third_party/. */
#ifndef RV565_BUNDLED_TINFL
#if RV565_PORT_ESP32
#define RV565_BUNDLED_TINFL 0
#else
#define RV565_BUNDLED_TINFL 1
#endif
#endif

#endif /* RV565_CONFIG_H */
