# Pico SDK example: build with
#   cmake -B build -DPICO_BOARD=pico2 && cmake --build build
cmake_minimum_required(VERSION 3.13)
include($ENV{PICO_SDK_PATH}/external/pico_sdk_import.cmake)
project(rv565_pico_player C CXX ASM)
set(CMAKE_C_STANDARD 11)
pico_sdk_init()

add_subdirectory(${CMAKE_CURRENT_LIST_DIR}/../.. rv565)

add_executable(rv565_player main.c)
target_link_libraries(rv565_player rv565 pico_stdlib)
pico_add_extra_outputs(rv565_player)
