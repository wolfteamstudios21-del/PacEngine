#pragma once
#include <cstdint>
#include <string>
#include <array>

namespace pac::render {

struct PacVec3 {
    float x = 0.f, y = 0.f, z = 0.f;
};

struct PacVec4 {
    float r = 1.f, g = 1.f, b = 1.f, a = 1.f;
};

struct PacMat4 {
    float m[4][4] = {
        {1,0,0,0},
        {0,1,0,0},
        {0,0,1,0},
        {0,0,0,1}
    };
};

// Sky types — matches visual_manifest.json sky_type enum
enum class SkyModel : uint8_t {
    Physical    = 0,  // "physical"    — Rayleigh + Mie scattering
    HdrCubemap  = 1,  // "hdr_cubemap" — equirectangular HDR panorama
    Procedural  = 2,  // "procedural"  — custom gradient / shader
    Simple      = 3,  // "simple"      — single colour fill
};

// GI types — matches visual_manifest.json gi_type enum
enum class GiType : uint8_t {
    None       = 0,  // "none"
    ProbeGrid  = 1,  // "probe_grid"
    Voxel      = 2,  // "voxel"
    Hybrid     = 3,  // "hybrid"
};

enum class Tonemap : uint8_t {
    Aces   = 0,
    Linear = 1,
    Filmic = 2,
};

enum class LightType : uint8_t {
    Directional = 0,
    Point       = 1,
    Spot        = 2,
    Area        = 3,
};

struct LightData {
    LightType type      = LightType::Directional;
    PacVec3   direction = {0.f, -1.f, 0.f};
    PacVec3   position  = {};
    PacVec4   color     = {1.f, 1.f, 1.f, 1.f};
    float     intensity = 1.f;
    float     range     = 0.f;
    bool      castShadows = true;
};

struct EnvironmentData {
    SkyModel  skyModel         = SkyModel::PhysicalSky;
    PacVec3   sunDirection     = {0.5f, 0.8f, 0.3f};
    float     sunIntensity     = 1.f;
    float     atmosphericDensity = 1.f;
    float     fogDensity       = 0.02f;
    PacVec3   fogColor         = {0.7f, 0.8f, 0.9f};
    std::string hdriPath;
};

struct GiSettings {
    GiType giType       = GiType::VoxelProbeHybrid;
    float  voxelSize    = 0.5f;
    int    probeDensity = 1;  // 0=low 1=medium 2=high
};

struct PostProcessSettings {
    Tonemap tonemap       = Tonemap::Aces;
    float   bloomIntensity = 0.3f;
    float   exposure      = 1.f;
};

struct PacRenderConfig {
    uint32_t width  = 1280;
    uint32_t height = 720;
    bool     vsync  = true;
    bool     debugOverlay = false;
};

} // namespace pac::render
