#pragma once
#include <cstdint>
#include <string>
#include "render_types.h"

namespace pac::render {

class Texture;

struct MaterialProperties {
    PacVec4 baseColorFactor     = {1.f, 1.f, 1.f, 1.f};
    float   metallicFactor      = 0.f;
    float   roughnessFactor     = 0.8f;
    float   normalScale         = 1.f;
    float   occlusionStrength   = 1.f;
    PacVec4 emissiveFactor      = {0.f, 0.f, 0.f, 0.f};
    bool    doubleSided         = false;
    bool    alphaBlend          = false;
};

class Material {
public:
    std::string         name;
    MaterialProperties  properties;

    Texture* baseColorTexture          = nullptr;
    Texture* metallicRoughnessTexture  = nullptr;
    Texture* normalTexture             = nullptr;
    Texture* occlusionTexture          = nullptr;
    Texture* emissiveTexture           = nullptr;

    // Selects the compiled pipeline variant (opaque / alpha-blend / double-sided, etc.)
    uint32_t shaderVariant = 0;

    void BuildPipeline();  // Phase 2.5.1 — compile / fetch from pipeline cache
};

} // namespace pac::render
