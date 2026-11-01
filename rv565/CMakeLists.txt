# One CMakeLists for two build systems:
#   ESP-IDF  -> registered as a component (ROM tinfl, ESP32 port)
#   Pico SDK -> an INTERFACE library named rv565 (bundled tinfl, RP2 port)
#   Arduino builds ignore this file and compile src/ directly.

if(ESP_PLATFORM)
    # esp_driver_* split out of `driver` in ESP-IDF 5.3.
    set(rv565_drivers driver)
    if("${IDF_VERSION_MAJOR}.${IDF_VERSION_MINOR}" VERSION_GREATER_EQUAL "5.3")
        set(rv565_drivers esp_driver_spi esp_driver_gpio)
    endif()
    idf_component_register(
        SRCS "src/rv565.c" "src/rv565_player.c" "src/port/esp32/rv565_esp32.c"
        INCLUDE_DIRS "src"
        PRIV_REQUIRES ${rv565_drivers} esp_timer esp_rom)
    return()
endif()

cmake_minimum_required(VERSION 3.13)

add_library(rv565 INTERFACE)
target_sources(rv565 INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}/src/rv565.c
    ${CMAKE_CURRENT_LIST_DIR}/src/rv565_player.c
    ${CMAKE_CURRENT_LIST_DIR}/src/third_party/miniz_tinfl.c)
target_include_directories(rv565 INTERFACE ${CMAKE_CURRENT_LIST_DIR}/src)

if(PICO_SDK_VERSION_STRING)
    target_sources(rv565 INTERFACE ${CMAKE_CURRENT_LIST_DIR}/src/port/rp2/rv565_rp2.c)
    target_compile_definitions(rv565 INTERFACE RV565_PORT_RP2=1)
    target_link_libraries(rv565 INTERFACE pico_stdlib hardware_spi hardware_dma pico_multicore)
endif()
