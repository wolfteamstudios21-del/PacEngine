#pragma once
#include "../core/render_types.h"

namespace pac::render {

// Applies per-fragment exponential height-based fog as a post-scene pass.
// In Phase 2.5.1 this can be a simple depth-based blend over the sky color.
class FogSystem {
public:
    void Apply(const EnvironmentData& env);
    void Render();

    void SetDensity(float density);
    void SetColor(const PacVec3& color);
    void SetHeightFalloff(float falloff);

private:
    float   m_density      = 0.02f;
    PacVec3 m_color        = {0.7f, 0.8f, 0.9f};
    float   m_heightFalloff = 0.1f;
};

} // namespace pac::render
