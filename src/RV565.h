/* Arduino entry point: #include <RV565.h> pulls in the core, the player and
 * the port for the current board (ESP32 or RP2040/RP2350). */
#ifndef RV565_ARDUINO_H
#define RV565_ARDUINO_H

#include "rv565.h"
#include "rv565_panel.h"
#include "rv565_player.h"

#if RV565_PORT_ESP32
#include "port/esp32/rv565_esp32.h"
#elif RV565_PORT_RP2
#include "port/rp2/rv565_rp2.h"
#endif

#endif /* RV565_ARDUINO_H */
