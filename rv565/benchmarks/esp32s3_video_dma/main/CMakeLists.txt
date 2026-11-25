# idf.py -DRV565_OVERLAP=1 selects the dual-core overlapped decode path;
# -DRV565_BACKLIGHT=<percent> sets the PWM backlight duty; -DRV565_CODEC=1
# plays the MJPEG baseline (main/video.mjpeg) instead of RV565
# (main/video.rv565). All are cached, so pass them explicitly every time the
# mode changes.
if(NOT DEFINED RV565_OVERLAP)
    set(RV565_OVERLAP 0)
endif()
if(NOT DEFINED RV565_BACKLIGHT)
    set(RV565_BACKLIGHT 60)
endif()
if(NOT DEFINED RV565_SELFTEST)
    set(RV565_SELFTEST 0)
endif()
if(NOT DEFINED RV565_CODEC)
    set(RV565_CODEC 0)
endif()

if(RV565_CODEC EQUAL 1)
    set(VIDEO_NAME "video.mjpeg")
    set(VIDEO_TOOL "tools/encode_mjpeg_benchmark.py")
else()
    set(VIDEO_NAME "video.rv565")
    set(VIDEO_TOOL "tools/encode_video_benchmark.py")
endif()
if(NOT EXISTS "${CMAKE_CURRENT_LIST_DIR}/${VIDEO_NAME}")
    message(FATAL_ERROR
        "Missing ${CMAKE_CURRENT_LIST_DIR}/${VIDEO_NAME}. Run ${VIDEO_TOOL} first.")
endif()

idf_component_register(
    SRCS "main.c"
    INCLUDE_DIRS "."
    EMBED_FILES "${VIDEO_NAME}"
)

target_compile_definitions(${COMPONENT_LIB} PRIVATE
    RV565_OVERLAP=${RV565_OVERLAP}
    RV565_BACKLIGHT=${RV565_BACKLIGHT}
    RV565_SELFTEST=${RV565_SELFTEST}
    RV565_CODEC=${RV565_CODEC})
