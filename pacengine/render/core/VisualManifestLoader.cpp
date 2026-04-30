#include "VisualManifestLoader.h"

#include <cstdio>
#include <fstream>
#include <sstream>

// ─── nlohmann/json integration ───────────────────────────────────────────────
// Added to the build when PACENGINE_BUILD_RENDER=ON via CMake FetchContent.
// Without it, Load() and Parse() return false with a diagnostic message.
#if defined(HAVE_NLOHMANN_JSON)
#include <nlohmann/json.hpp>
using json = nlohmann::json;
#endif

namespace pac::render {

#if defined(HAVE_NLOHMANN_JSON)

// ─── helpers ─────────────────────────────────────────────────────────────────

static PacVec3 ReadVec3(const json& j, const char* key, PacVec3 def = {}) {
    if (!j.contains(key) || !j[key].is_array() || j[key].size() < 3) return def;
    return {j[key][0].get<float>(), j[key][1].get<float>(), j[key][2].get<float>()};
}

static PacVec4 ReadVec4(const json& j, const char* key, PacVec4 def = {1,1,1,1}) {
    if (!j.contains(key) || !j[key].is_array() || j[key].size() < 4) return def;
    return {j[key][0].get<float>(), j[key][1].get<float>(),
            j[key][2].get<float>(), j[key][3].get<float>()};
}

template<typename T>
static T GetOr(const json& j, const char* key, T def) {
    return j.contains(key) ? j[key].get<T>() : def;
}

// ─── sub-object parsers ───────────────────────────────────────────────────────

static VisualEnvironment ParseEnvironment(const json& j) {
    VisualEnvironment e;
    e.sky_type          = GetOr<std::string>(j, "sky_type", "physical");
    e.sun_direction     = ReadVec3(j, "sun_direction", {0.5f, 0.8f, 0.3f});
    e.sun_intensity     = GetOr<float>(j, "sun_intensity", 1.2f);
    e.sun_color         = ReadVec3(j, "sun_color", {1.f, 0.95f, 0.85f});
    e.ambient_intensity = GetOr<float>(j, "ambient_intensity", 0.4f);
    e.fog_enabled       = GetOr<bool>(j, "fog_enabled", true);
    e.fog_density       = GetOr<float>(j, "fog_density", 0.015f);
    e.fog_color         = ReadVec3(j, "fog_color", {0.7f, 0.8f, 0.9f});
    e.fog_height_falloff = GetOr<float>(j, "fog_height_falloff", 0.5f);
    return e;
}

static VisualGI ParseGI(const json& j) {
    VisualGI gi;
    gi.gi_type       = GetOr<std::string>(j, "gi_type", "probe_grid");
    gi.probe_density = GetOr<std::string>(j, "probe_density", "medium");
    return gi;
}

static MaterialOverride ParseMaterialOverride(const json& j) {
    MaterialOverride mo;
    mo.baseColorFactor = ReadVec4(j, "baseColorFactor");
    mo.metallicFactor  = GetOr<float>(j, "metallicFactor", 0.f);
    mo.roughnessFactor = GetOr<float>(j, "roughnessFactor", 0.8f);
    return mo;
}

static VisualEntityOverride ParseEntity(const json& j) {
    VisualEntityOverride eo;
    eo.id = GetOr<int>(j, "id", 0);
    if (j.contains("render") && j["render"].is_object()) {
        const auto& r = j["render"];
        eo.render.asset          = GetOr<std::string>(r, "asset", "");
        eo.render.cast_shadows   = GetOr<bool>(r, "cast_shadows", true);
        eo.render.receive_shadows = GetOr<bool>(r, "receive_shadows", true);
        eo.render.visible        = GetOr<bool>(r, "visible", true);
        if (r.contains("material_overrides") && r["material_overrides"].is_object()) {
            for (auto& [slot, moJson] : r["material_overrides"].items()) {
                eo.render.material_overrides[slot] = ParseMaterialOverride(moJson);
            }
        }
    }
    return eo;
}

static VisualStaticMesh ParseStaticMesh(const json& j) {
    VisualStaticMesh sm;
    sm.id              = GetOr<std::string>(j, "id", "");
    sm.asset           = GetOr<std::string>(j, "asset", "");
    sm.material_intent = GetOr<std::string>(j, "material_intent", "");
    if (j.contains("transform") && j["transform"].is_object()) {
        const auto& t = j["transform"];
        sm.transform.position = ReadVec3(t, "position");
        sm.transform.scale    = ReadVec3(t, "scale", {1.f, 1.f, 1.f});
        if (t.contains("rotation") && t["rotation"].is_array() && t["rotation"].size() >= 4) {
            sm.transform.rotation = {
                t["rotation"][0].get<float>(), t["rotation"][1].get<float>(),
                t["rotation"][2].get<float>(), t["rotation"][3].get<float>()
            };
        }
    }
    return sm;
}

static VisualLight ParseLight(const json& j) {
    VisualLight l;
    l.type      = GetOr<std::string>(j, "type", "directional");
    l.position  = ReadVec3(j, "position");
    l.direction = ReadVec3(j, "direction", {0.f, -1.f, 0.f});
    l.color     = ReadVec3(j, "color", {1.f, 1.f, 1.f});
    l.intensity = GetOr<float>(j, "intensity", 1.f);
    l.range     = GetOr<float>(j, "range", 0.f);
    return l;
}

static VisualPostProcessing ParsePostProcessing(const json& j) {
    VisualPostProcessing pp;
    pp.tonemap         = GetOr<std::string>(j, "tonemap", "aces");
    pp.exposure        = GetOr<float>(j, "exposure", 1.f);
    pp.bloom_intensity = GetOr<float>(j, "bloom_intensity", 0.25f);
    pp.contrast        = GetOr<float>(j, "contrast", 1.f);
    pp.saturation      = GetOr<float>(j, "saturation", 1.f);
    return pp;
}

static VisualCameraDefault ParseCamera(const json& j) {
    VisualCameraDefault cam;
    cam.position = ReadVec3(j, "position", {15.f, 25.f, 15.f});
    cam.target   = ReadVec3(j, "target");
    return cam;
}

// ─── main parse ───────────────────────────────────────────────────────────────

static bool ParseJson(const json& root, VisualManifest& out) {
    out.visual_version  = GetOr<std::string>(root, "visual_version", "1.0.0");
    out.pacdata_version = GetOr<std::string>(root, "pacdata_version", "");

    if (root.contains("environment") && root["environment"].is_object())
        out.environment = ParseEnvironment(root["environment"]);

    if (root.contains("global_illumination") && root["global_illumination"].is_object())
        out.global_illumination = ParseGI(root["global_illumination"]);

    if (root.contains("entities") && root["entities"].is_array())
        for (const auto& e : root["entities"])
            out.entities.push_back(ParseEntity(e));

    if (root.contains("static_meshes") && root["static_meshes"].is_array())
        for (const auto& m : root["static_meshes"])
            out.static_meshes.push_back(ParseStaticMesh(m));

    if (root.contains("lights") && root["lights"].is_array())
        for (const auto& l : root["lights"])
            out.lights.push_back(ParseLight(l));

    if (root.contains("post_processing") && root["post_processing"].is_object())
        out.post_processing = ParsePostProcessing(root["post_processing"]);

    if (root.contains("camera_default") && root["camera_default"].is_object())
        out.camera_default = ParseCamera(root["camera_default"]);

    return true;
}

#endif // HAVE_NLOHMANN_JSON

// ─── public API ───────────────────────────────────────────────────────────────

bool VisualManifestLoader::Load(const std::string& filePath, VisualManifest& out) {
#if defined(HAVE_NLOHMANN_JSON)
    std::ifstream f(filePath);
    if (!f.is_open()) {
        std::fprintf(stderr, "[VisualManifestLoader] Cannot open: %s\n", filePath.c_str());
        return false;
    }
    std::ostringstream ss;
    ss << f.rdbuf();
    return Parse(ss.str(), out);
#else
    std::fprintf(stderr,
        "[VisualManifestLoader] nlohmann/json not compiled in "
        "(rebuild with PACENGINE_BUILD_RENDER=ON)\n");
    (void)filePath; (void)out;
    return false;
#endif
}

bool VisualManifestLoader::Parse(const std::string& jsonStr, VisualManifest& out) {
#if defined(HAVE_NLOHMANN_JSON)
    try {
        json root = json::parse(jsonStr);
        return ParseJson(root, out);
    } catch (const json::exception& ex) {
        std::fprintf(stderr, "[VisualManifestLoader] JSON parse error: %s\n", ex.what());
        return false;
    }
#else
    (void)jsonStr; (void)out;
    return false;
#endif
}

} // namespace pac::render
