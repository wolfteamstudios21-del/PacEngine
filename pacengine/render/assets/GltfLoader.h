#pragma once
#include <memory>
#include <string>
#include <vector>
#include "../core/Mesh.h"
#include "../core/Material.h"

namespace pac::render {

struct GltfLoadResult {
    std::vector<std::shared_ptr<Mesh>>     meshes;
    std::vector<std::shared_ptr<Material>> materials;
    bool success = false;
    std::string error;
};

// Loads a glTF 2.0 file (binary .glb or JSON .gltf) and produces Mesh + Material
// objects ready to assign to RenderProxies.
//
// Phase 2.5.1 — backed by fastgltf (preferred) or tinygltf (fallback).
// The loader is intentionally stateless; call LoadFile for each asset.
class GltfLoader {
public:
    GltfLoader();
    ~GltfLoader();

    GltfLoadResult LoadFile(const std::string& path);
    GltfLoadResult LoadMemory(const void* data, size_t size, const std::string& hint = "");

    // Pre-cache textures on the GPU after loading.
    void UploadToGpu(GltfLoadResult& result);

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace pac::render
