cmake_minimum_required(VERSION 3.20)
project(pacengine_napi VERSION 0.1.0 LANGUAGES NONE)

# pacengine_napi — CMake wrapper for the Node.js N-API addon (M2.5.3)
#
# This module is intentionally LANGUAGES NONE: the addon itself is built by
# node-gyp (a separate toolchain).  CMake's role here is to:
#   1. Ensure libpacengine_render is built first.
#   2. Invoke node-gyp to compile the addon against it.
#
# Usage (from workspace root):
#   cmake -S pacengine -B pacengine/build -DPACENGINE_BUILD_RENDER=ON
#   cmake --build pacengine/build --target pacengine_render
#   cd pacengine/napi && pnpm install && pnpm run build
#
# The built addon is output to pacengine/napi/build/Release/pacrenderer.node.

option(PACENGINE_BUILD_NAPI "Build the N-API addon (requires libpacengine_render.a)" OFF)

if(NOT PACENGINE_BUILD_NAPI)
    return()
endif()

find_program(NODE_GYP node-gyp HINTS
    "${CMAKE_SOURCE_DIR}/napi/node_modules/.bin"
    "$ENV{HOME}/.local/bin"
    DOC "node-gyp executable")

if(NOT NODE_GYP)
    message(WARNING "[pacengine_napi] node-gyp not found. "
        "Install it via: pnpm --filter @workspace/pacengine-napi install")
    return()
endif()

add_custom_target(pacengine_napi ALL
    COMMAND ${NODE_GYP} build
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
    COMMENT "Building N-API addon (pacrenderer.node)"
    VERBATIM)
