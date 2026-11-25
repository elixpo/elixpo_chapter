add_library(usermod_oreo_rv565 INTERFACE)

# The RV565 core (src/rv565.c) applies partial deltas; on the ESP32 it
# inflates with the ROM tinfl, like the rest of this module.
target_sources(usermod_oreo_rv565 INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}/modoreo_rv565.c
    ${CMAKE_CURRENT_LIST_DIR}/../../src/rv565.c
)

target_include_directories(usermod_oreo_rv565 INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}
    ${CMAKE_CURRENT_LIST_DIR}/../../src
)

target_link_libraries(usermod INTERFACE usermod_oreo_rv565)
