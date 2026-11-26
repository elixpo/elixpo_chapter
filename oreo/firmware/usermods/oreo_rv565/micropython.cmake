add_library(usermod_oreo_rv565 INTERFACE)

target_sources(usermod_oreo_rv565 INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}/modoreo_rv565.c
    ${CMAKE_CURRENT_LIST_DIR}/oreo_splash.c
    # The RV565 2.0.0 core, vendored in rv565/ (see rv565/VENDORED.md).
    ${CMAKE_CURRENT_LIST_DIR}/rv565_core.c
)

target_include_directories(usermod_oreo_rv565 INTERFACE
    ${CMAKE_CURRENT_LIST_DIR}
)

target_link_libraries(usermod INTERFACE usermod_oreo_rv565)
