if(NOT RV565_CLIP)
    set(RV565_CLIP "${CMAKE_CURRENT_LIST_DIR}/../../../tests/data/v7/rgb565be_zlib_shift_k10.rv565")
endif()
if(NOT EXISTS "${RV565_CLIP}")
    message(FATAL_ERROR "RV565_CLIP not found: ${RV565_CLIP}")
endif()
if(NOT DEFINED RV565_OVERLAP)
    set(RV565_OVERLAP 1)
endif()
# Embedded as clip.rv565 whatever its name, so the symbols stay fixed.
configure_file("${RV565_CLIP}" "${CMAKE_CURRENT_BINARY_DIR}/clip.rv565" COPYONLY)
get_filename_component(clip_name "${RV565_CLIP}" NAME)

idf_component_register(SRCS "main.c"
                       INCLUDE_DIRS "."
                       REQUIRES rv565 esp_driver_spi
                       EMBED_FILES "${CMAKE_CURRENT_BINARY_DIR}/clip.rv565")
target_compile_definitions(${COMPONENT_LIB} PRIVATE
    RV565_OVERLAP=${RV565_OVERLAP} RV565_CLIP_NAME="${clip_name}")
