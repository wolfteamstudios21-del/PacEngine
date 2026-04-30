cmake_minimum_required(VERSION 3.20)

# -----------------------------------------------------------------------
# pacengine_render — M2.5 render layer (Vulkan + glTF + atmospherics)
#
# OFF by default: the Vulkan SDK is not required to build or test the
# core simulation.  Enable when the Vulkan SDK is present:
#   cmake -DPACENGINE_BUILD_RENDER=ON ..
# -----------------------------------------------------------------------
option(PACENGINE_BUILD_RENDER "Build PacEngine render layer (M2.5, requires C++20)" OFF)

if(NOT PACENGINE_BUILD_RENDER)
    return()
endif()

include(FetchContent)

# -----------------------------------------------------------------------
# nlohmann/json — single-header JSON parser for VisualManifestLoader
# -----------------------------------------------------------------------
FetchContent_Declare(nlohmann_json
    URL      https://github.com/nlohmann/json/releases/download/v3.11.3/json.hpp
    URL_HASH SHA256=9bea4c8066ef4a1c206b2be5a36302f8926f7fdc6087af5d20b417d0cf103ea6
    DOWNLOAD_NO_EXTRACT TRUE
    DOWNLOAD_DIR        ${CMAKE_BINARY_DIR}/_deps/nlohmann_json_header
)
FetchContent_MakeAvailable(nlohmann_json)

# -----------------------------------------------------------------------
# pacengine_render static library
# -----------------------------------------------------------------------
set(RENDER_SOURCES
    core/PacRenderer.cpp
    core/RenderScene.cpp
    core/RenderProxy.cpp
    core/Material.cpp
    core/VisualManifestLoader.cpp
    assets/GltfLoader.cpp
    assets/TextureManager.cpp
    backend/VulkanContext.cpp
)

add_library(pacengine_render STATIC ${RENDER_SOURCES})

target_include_directories(pacengine_render
    PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}
    PRIVATE ${CMAKE_BINARY_DIR}/_deps/nlohmann_json_header
)

target_compile_features(pacengine_render PUBLIC cxx_std_20)
target_compile_definitions(pacengine_render PRIVATE HAVE_NLOHMANN_JSON)

# Link against the simulation core so RenderScene can read PacDataWorld types.
# target_link_libraries(pacengine_render PUBLIC pacengine_runtime)

# -----------------------------------------------------------------------
# Optional: Vulkan SDK
# -----------------------------------------------------------------------
find_package(Vulkan QUIET)
if(Vulkan_FOUND)
    target_link_libraries(pacengine_render PUBLIC Vulkan::Vulkan)
    target_compile_definitions(pacengine_render PUBLIC HAVE_VULKAN)
    message(STATUS "[render] Vulkan SDK found — enabling GPU backend")
else()
    message(STATUS "[render] Vulkan SDK NOT found — compiling stub backend only")
endif()

# -----------------------------------------------------------------------
# Optional: fastgltf (Phase 2.5.1 — swap in GltfLoader.cpp)
# -----------------------------------------------------------------------
# FetchContent_Declare(fastgltf
#     GIT_REPOSITORY https://github.com/spnda/fastgltf.git
#     GIT_TAG        v0.8.0)
# FetchContent_MakeAvailable(fastgltf)
# target_link_libraries(pacengine_render PRIVATE fastgltf)
# target_compile_definitions(pacengine_render PRIVATE HAVE_FASTGLTF)
