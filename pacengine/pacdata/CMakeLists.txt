add_library(pacdata STATIC
    src/PacData.cpp
    src/PacDataLoader.cpp
)

target_include_directories(pacdata
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/include
)

set_target_properties(pacdata PROPERTIES
    POSITION_INDEPENDENT_CODE ON
)

add_library(pacengine::pacdata ALIAS pacdata)
