cmake_minimum_required(VERSION 3.20)

# -----------------------------------------------------------------------
# pacengine_render — M2.5 render layer (Vulkan + glTF + atmospherics)
#
# OFF by default: the Vulkan SDK is not required to build or test the
# core simulation.  Enable when the Vulkan SDK is present:
#   cmake -DPACENGINE_BUILD_RENDER=ON ..
# -----------------------------------------------------------------------
option(PACENGINE_BUILD_RENDER "Build PacEngine render layer (requires C++20)" OFF)

if(NOT PACENGINE_BUILD_RENDER)
    return()
endif()

set(RENDER_SOURCES
    core/PacRenderer.cpp
    core/RenderScene.cpp
    core/RenderProxy.cpp
    core/Material.cpp
    assets/GltfLoader.cpp
    assets/TextureManager.cpp
    backend/VulkanContext.cpp
)

add_library(pacengine_render STATIC ${RENDER_SOURCES})

target_include_directories(pacengine_render PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
)

target_compile_features(pacengine_render PUBLIC cxx_std_20)

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
# Optional: fastgltf (Phase 2.5.1 — add when ready)
# -----------------------------------------------------------------------
# include(FetchContent)
# FetchContent_Declare(fastgltf
#     GIT_REPOSITORY https://github.com/spnda/fastgltf.git
#     GIT_TAG        main)
# FetchContent_MakeAvailable(fastgltf)
# target_link_libraries(pacengine_render PRIVATE fastgltf)
