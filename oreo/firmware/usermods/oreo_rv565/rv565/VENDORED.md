# Vendored RV565 core

`rv565.c`, `rv565.h` and `rv565_config.h` are copied unchanged from the RV565
library, https://github.com/elixpo/rv565, release **2.0.0** (tag `v2.0.0`,
commit `34509cc1b4100df72d09858836f0119375fcf058`), directory `src/`. They are
MIT licensed; `LICENSE` here is the library's licence.

The native boot splash player (`../oreo_splash.c`) uses them to open and
decode the splash clip (RV565 container version 7). On ESP-IDF,
`rv565_config.h` selects the ESP32-S3 ROM tinfl through `miniz.h`, so the
bundled `third_party/` inflater is not needed.

To update: copy the three files from a tagged release, update the version and
commit above, rebuild the firmware, and run the host tests.
