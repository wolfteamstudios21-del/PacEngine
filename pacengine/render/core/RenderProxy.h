#pragma once
#include <cstdint>
#include "render_types.h"

namespace pac::render {

class Mesh;
class Material;

// One RenderProxy per simulation entity.  Owned by RenderScene.
struct RenderProxy {
    uint64_t entityId  = 0;
    PacMat4  transform = {};

    Mesh*     mesh     = nullptr;
    Material* material = nullptr;

    bool visible     = true;
    bool castShadows = true;
    bool receiveShadows = true;

    // Animation state (Phase 2.5.3+)
    float       animationTime = 0.f;
    std::string animationName;
};

} // namespace pac::render
