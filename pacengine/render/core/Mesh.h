#pragma once
#include <cstdint>
#include <vector>
#include "render_types.h"

namespace pac::render {

// ─── Mesh primitives ─────────────────────────────────────────────────────────

struct Vertex {
    PacVec3 position;
    PacVec3 normal;
    float   uv[2]     = {0.f, 0.f};
    float   tangent[4]= {1.f, 0.f, 0.f, 1.f}; // xyz + handedness
};

// A single renderable primitive (one draw call, one material slot).
struct MeshPrimitive {
    std::vector<Vertex>   vertices;
    std::vector<uint32_t> indices;
    int materialIndex = 0;

    // Phase 2.5.1 — GPU buffer handles (set by GltfLoader::UploadToGpu).
    // Both the VkBuffer handle and its backing VkDeviceMemory are stored so
    // that VulkanContext::FreeHostBuffer can release both at shutdown/reload.
    uint64_t vertexBufferHandle = 0;
    uint64_t vertexMemoryHandle = 0;
    uint64_t indexBufferHandle  = 0;
    uint64_t indexMemoryHandle  = 0;
};

// A Mesh is one glTF mesh node — it may contain several primitives.
class Mesh {
public:
    std::vector<MeshPrimitive> primitives;
    std::string                name;

    bool IsEmpty() const { return primitives.empty(); }
};

} // namespace pac::render
