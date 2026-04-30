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
# nlohmann/json — vendored single header (render/vendor/nlohmann/json.hpp)
# No network access needed; header is committed directly to the repo.
# -----------------------------------------------------------------------
set(NLOHMANN_JSON_INCLUDE ${CMAKE_CURRENT_SOURCE_DIR}/vendor)

# -----------------------------------------------------------------------
# fastgltf v0.7.1 — CPU-side glTF 2.0 parser (M2.5.1)
# Header-guarded by HAVE_FASTGLTF.  Network access required at configure
# time; set FETCHCONTENT_FULLY_DISCONNECTED=ON to skip when offline.
# -----------------------------------------------------------------------
FetchContent_Declare(fastgltf
    GIT_REPOSITORY https://github.com/spnda/fastgltf.git
    GIT_TAG        v0.7.1
    GIT_SHALLOW    TRUE)
set(FASTGLTF_COMPILE_AS_CPP20 ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(fastgltf)

# -----------------------------------------------------------------------
# SPIR-V shader compilation (optional — requires glslc from Vulkan SDK)
# Pre-compiled SPV is also committed under shaders/prebuilt/ for offline
# builds.  Pipeline creation is skipped gracefully if SPV is missing.
# -----------------------------------------------------------------------
find_program(GLSLC glslc DOC "Vulkan GLSL compiler")
set(SHADER_SRC_DIR  "${CMAKE_CURRENT_SOURCE_DIR}/shaders")
set(SHADER_SPV_DIR  "${CMAKE_CURRENT_SOURCE_DIR}/shaders/prebuilt")
file(MAKE_DIRECTORY "${SHADER_SPV_DIR}")

set(SHADER_SOURCES
    "${SHADER_SRC_DIR}/unlit.vert"
    "${SHADER_SRC_DIR}/unlit.frag"
)
set(COMPILED_SHADERS)

if(GLSLC)
    foreach(SRC ${SHADER_SOURCES})
        get_filename_component(NAME ${SRC} NAME)
        set(SPV "${SHADER_SPV_DIR}/${NAME}.spv")
        add_custom_command(
            OUTPUT  "${SPV}"
            COMMAND "${GLSLC}" -o "${SPV}" "${SRC}"
            DEPENDS "${SRC}"
            COMMENT "Compiling shader: ${NAME}")
        list(APPEND COMPILED_SHADERS "${SPV}")
    endforeach()
    add_custom_target(pacengine_shaders DEPENDS ${COMPILED_SHADERS})
    message(STATUS "[render] glslc found — shaders will compile at build time")
else()
    message(STATUS "[render] glslc NOT found — using pre-built SPV from shaders/prebuilt/")
    add_custom_target(pacengine_shaders)  # empty target so dependents still work
endif()

# -----------------------------------------------------------------------
# pacengine_render static library
# -----------------------------------------------------------------------
set(RENDER_SOURCES
    core/PacRenderer.cpp
    core/RenderScene.cpp
    core/RenderProxy.cpp
    core/Material.cpp
    core/VisualManifestLoader.cpp
    core/PacDataLoader.cpp
    importer/PacWorldImporter.cpp
    assets/GltfLoader.cpp
    assets/TextureManager.cpp
    backend/VulkanContext.cpp
)

add_library(pacengine_render STATIC ${RENDER_SOURCES})
add_dependencies(pacengine_render pacengine_shaders)

target_include_directories(pacengine_render
    PUBLIC  ${CMAKE_CURRENT_SOURCE_DIR}
    PRIVATE ${NLOHMANN_JSON_INCLUDE}
            ${CMAKE_BINARY_DIR}/_deps/fastgltf-src/include
)

target_compile_features(pacengine_render PUBLIC cxx_std_20)
target_compile_definitions(pacengine_render
    PUBLIC  HAVE_FASTGLTF           # propagate to all consumers (render_smoke, N-API bridge, etc.)
    PRIVATE HAVE_NLOHMANN_JSON
            PAC_SHADER_DIR="${SHADER_SPV_DIR}"
)
target_link_libraries(pacengine_render PRIVATE fastgltf::fastgltf)

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
# Render smoke test — always built alongside the library
# -----------------------------------------------------------------------
add_executable(render_smoke tests/render_smoke.cpp)
target_link_libraries(render_smoke PRIVATE pacengine_render)
target_include_directories(render_smoke PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_features(render_smoke PRIVATE cxx_std_20)
