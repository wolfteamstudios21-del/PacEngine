#include "GltfLoader.h"
#include <cstdio>

// Phase 2.5.1 — add fastgltf or tinygltf as a CMake FetchContent dependency,
// then replace the stub bodies with real parsing.

namespace pac::render {

struct GltfLoader::Impl {};

GltfLoader::GltfLoader()  : m_impl(std::make_unique<Impl>()) {}
GltfLoader::~GltfLoader() = default;

GltfLoadResult GltfLoader::LoadFile(const std::string& path) {
    std::printf("[GltfLoader] LoadFile (stub): %s\n", path.c_str());
    GltfLoadResult r;
    r.success = false;
    r.error   = "GltfLoader not yet implemented (Phase 2.5.1)";
    return r;
}

GltfLoadResult GltfLoader::LoadMemory(const void* /*data*/, size_t /*size*/, const std::string& hint) {
    std::printf("[GltfLoader] LoadMemory (stub) hint=%s\n", hint.c_str());
    GltfLoadResult r;
    r.success = false;
    r.error   = "GltfLoader not yet implemented (Phase 2.5.1)";
    return r;
}

void GltfLoader::UploadToGpu(GltfLoadResult& /*result*/) {
    // Phase 2.5.1 — allocate Vulkan buffers / images, upload via staging buffer.
}

} // namespace pac::render
