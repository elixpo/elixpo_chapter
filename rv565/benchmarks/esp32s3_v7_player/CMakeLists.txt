# RV565 version 7 and 8 playback benchmark for the Falera Badge (ESP32-S3 N16R8,
# 320x240 ST7789). Builds the player around one clip, chosen at configure time:
#   idf.py -DRV565_CLIP=/abs/path/clip.rv565 -DRV565_OVERLAP=1 build
# RV565_OVERLAP=1 inflates on core 1 (dual-core, the default); 0 is serial.
cmake_minimum_required(VERSION 3.16)
# The library is this checkout, used directly. ESP-IDF names a component
# after its folder, so a checkout in a folder not called rv565 (a git
# worktree, a renamed clone) is linked into the build folder as rv565.
get_filename_component(RV565_ROOT "${CMAKE_CURRENT_LIST_DIR}/../.." REALPATH)
get_filename_component(RV565_DIR_NAME "${RV565_ROOT}" NAME)
if(RV565_DIR_NAME STREQUAL "rv565")
    set(EXTRA_COMPONENT_DIRS "${RV565_ROOT}")
else()
    file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/components")
    file(CREATE_LINK "${RV565_ROOT}" "${CMAKE_BINARY_DIR}/components/rv565" SYMBOLIC)
    set(EXTRA_COMPONENT_DIRS "${CMAKE_BINARY_DIR}/components/rv565")
endif()
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(rv565_v7_player)
