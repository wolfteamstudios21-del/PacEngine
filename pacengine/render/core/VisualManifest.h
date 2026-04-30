#pragma once
// C++ mirror of visual_manifest.json v1.0.0
// All field names use snake_case to match the JSON schema exactly, making
// VisualManifestLoader::Parse() a straightforward key→field mapping.

#include <array>
#include <string>
#include <unordered_map>
#include <vector>
#include "render_types.h"

namespace pac::render {

// ─── environment ─────────────────────────────────────────────────────────────

struct VisualEnvironment {
    std::string sky_type          = "physical"; // physical | hdr_cubemap | procedural | simple
    PacVec3     sun_direction     = {0.5f, 0.8f, 0.3f};
    float       sun_intensity     = 1.2f;
    PacVec3     sun_color         = {1.0f, 0.95f, 0.85f};
    float       ambient_intensity = 0.4f;
    bool        fog_enabled       = true;
    float       fog_density       = 0.015f;
    PacVec3     fog_color         = {0.7f, 0.8f, 0.9f};
    float       fog_height_falloff = 0.5f;
};

// ─── global_illumination ─────────────────────────────────────────────────────

struct VisualGI {
    std::string gi_type       = "probe_grid"; // none | probe_grid | voxel | hybrid
    std::string probe_density = "medium";     // low | medium | high
};

// ─── entities ────────────────────────────────────────────────────────────────

struct MaterialOverride {
    PacVec4 baseColorFactor = {1.f, 1.f, 1.f, 1.f};
    float   metallicFactor  = 0.f;
    float   roughnessFactor = 0.8f;
};

struct VisualEntityRender {
    std::string asset;                                             // required
    std::unordered_map<std::string, MaterialOverride> material_overrides;
    bool cast_shadows    = true;
    bool receive_shadows = true;
    bool visible         = true;
};

struct VisualEntityOverride {
    int                id = 0; // integer slot index (0-based)
    VisualEntityRender render;
};

// ─── static_meshes ───────────────────────────────────────────────────────────

struct StaticMeshTransform {
    PacVec3              position = {};
    std::array<float, 4> rotation = {0.f, 0.f, 0.f, 1.f}; // quaternion xyzw
    PacVec3              scale    = {1.f, 1.f, 1.f};
};

struct VisualStaticMesh {
    std::string         id;     // required
    std::string         asset;  // required — relative path to glTF
    StaticMeshTransform transform;
    std::string         material_intent; // e.g. "grass", "rock_rough"
};

// ─── lights ──────────────────────────────────────────────────────────────────

struct VisualLight {
    std::string type      = "directional"; // directional | point | spot
    PacVec3     position  = {};
    PacVec3     direction = {0.f, -1.f, 0.f};
    PacVec3     color     = {1.f, 1.f, 1.f};
    float       intensity = 1.f;
    float       range     = 0.f;
};

// ─── post_processing ─────────────────────────────────────────────────────────

struct VisualPostProcessing {
    std::string tonemap        = "aces";
    float       exposure       = 1.f;
    float       bloom_intensity = 0.25f;
    float       contrast       = 1.f;
    float       saturation     = 1.f;
};

// ─── camera_default ──────────────────────────────────────────────────────────

struct VisualCameraDefault {
    PacVec3 position = {15.f, 25.f, 15.f};
    PacVec3 target   = {0.f,  0.f,  0.f};
};

// ─── Top-level manifest ───────────────────────────────────────────────────────

struct VisualManifest {
    std::string visual_version  = "1.0.0";
    std::string pacdata_version;

    VisualEnvironment              environment;
    VisualGI                       global_illumination;
    std::vector<VisualEntityOverride> entities;
    std::vector<VisualStaticMesh>  static_meshes;
    std::vector<VisualLight>       lights;
    VisualPostProcessing           post_processing;
    VisualCameraDefault            camera_default;
};

// ─── Conversion helpers (VisualManifest → internal RenderScene types) ────────

// Converts VisualEnvironment → EnvironmentData for RenderScene::SetEnvironment()
inline EnvironmentData ToEnvironmentData(const VisualEnvironment& ve) {
    EnvironmentData ed;
    if      (ve.sky_type == "physical")    ed.skyModel = SkyModel::Physical;
    else if (ve.sky_type == "hdr_cubemap") ed.skyModel = SkyModel::HdrCubemap;
    else if (ve.sky_type == "procedural")  ed.skyModel = SkyModel::Procedural;
    else                                   ed.skyModel = SkyModel::Simple;
    ed.sunDirection      = ve.sun_direction;
    ed.sunIntensity      = ve.sun_intensity;
    ed.atmosphericDensity = ve.ambient_intensity;
    ed.fogDensity        = ve.fog_density;
    ed.fogColor          = ve.fog_color;
    return ed;
}

// Converts VisualLight → LightData for RenderScene::AddLight()
inline LightData ToLightData(const VisualLight& vl) {
    LightData ld;
    if      (vl.type == "directional") ld.type = LightType::Directional;
    else if (vl.type == "point")       ld.type = LightType::Point;
    else if (vl.type == "spot")        ld.type = LightType::Spot;
    ld.position  = vl.position;
    ld.direction = vl.direction;
    ld.color     = {vl.color.x, vl.color.y, vl.color.z, 1.f};
    ld.intensity = vl.intensity;
    ld.range     = vl.range;
    return ld;
}

} // namespace pac::render
