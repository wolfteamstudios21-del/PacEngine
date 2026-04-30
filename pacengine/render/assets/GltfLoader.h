#pragma once
#include <memory>
#include <string>
#include <vector>
#include "../core/Mesh.h"
#include "../core/Material.h"

namespace pac::render {

class VulkanContext;

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

    // Allocate host-visible GPU buffers for every MeshPrimitive in result.
    // On success, MeshPrimitive::vertexBufferHandle and indexBufferHandle are non-zero.
    // ctx may be nullptr (or IsGpuActive()==false), in which case this is a no-op.
    void UploadToGpu(GltfLoadResult& result, VulkanContext* ctx);

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace pac::render
