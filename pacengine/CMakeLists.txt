cmake_minimum_required(VERSION 3.20)
project(PacEngine
    VERSION 0.1.0
    DESCRIPTION "Native Pac runtime: PacData-driven engine with ConflictSim"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Wpedantic)
endif()

option(PACENGINE_BUILD_TESTS "Build PacEngine tests" ON)
option(PACENGINE_BUILD_GAME  "Build sample game host" ON)

add_subdirectory(pacdata)
add_subdirectory(engine)

if(PACENGINE_BUILD_GAME)
    add_subdirectory(game)
endif()

if(PACENGINE_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()
