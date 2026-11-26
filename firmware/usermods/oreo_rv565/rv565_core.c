// SPDX-License-Identifier: MIT
// Builds the vendored RV565 core (rv565/rv565.c, unchanged) for the badge:
// the ESP32 port with the ROM inflater. The settings are made here rather
// than on the command line because MicroPython's QSTR scan preprocesses
// user C modules without ESP_PLATFORM.
#define RV565_PORT_ESP32 1
#define RV565_BUNDLED_TINFL 0
#include "rv565/rv565.c"
