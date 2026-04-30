#pragma once
#include "../core/render_types.h"
#include <string>

namespace pac::render {

// Manages the sky background rendered before scene geometry.
// Supports three modes matching visual_manifest.json skyModel:
//   physical_sky — procedural Rayleigh + Mie scattering
//   hdri         — equirectangular HDR panorama projected onto a skybox cube
//   procedural   — simple gradient / custom shader
class SkySystem {
public:
    void Apply(const EnvironmentData& env);
    void Render();

    void SetHdriPath(const std::string& path);
    void SetSunDirection(const PacVec3& dir);
    void SetSunIntensity(float intensity);
    void SetAtmosphericDensity(float density);

private:
    EnvironmentData m_env;
    std::string     m_hdriPath;
};

} // namespace pac::render
