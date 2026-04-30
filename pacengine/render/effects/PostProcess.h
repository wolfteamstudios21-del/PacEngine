#pragma once
#include "../core/render_types.h"

namespace pac::render {

// Fullscreen post-processing stack — applied after scene compositing.
// Phase 2.5.1 MVP: ACES tonemap + exposure, bloom.
// Phase 2.5.3+: SSAO, TAA, depth-of-field.
class PostProcess {
public:
    void Apply(const PostProcessSettings& settings);
    void Render();

    void SetTonemap(Tonemap t);
    void SetBloom(float intensity, float threshold = 1.f);
    void SetExposure(float exposure);

private:
    PostProcessSettings m_settings;
    float m_bloomThreshold = 1.f;
};

} // namespace pac::render
