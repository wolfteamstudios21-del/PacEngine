#include "PacRenderer.h"
#include "RenderScene.h"
#include "RenderProxy.h"
#include "VisualManifestLoader.h"
#include "PacDataLoader.h"
#include "../backend/VulkanContext.h"
#include "../assets/GltfLoader.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <unordered_map>

namespace pac::render {
namespace fs = std::filesystem;

// ─── Impl ─────────────────────────────────────────────────────────────────────

struct PacRenderer::Impl {
    std::unique_ptr<VulkanContext> vkCtx;
    std::unique_ptr<RenderScene>   scene;
    GltfLoader                     gltfLoader;

    PacVec3 camPos    = {0.f, 5.f, -10.f};
    PacVec3 camTarget = {0.f, 0.f,   0.f};
    float   camFov    = 60.f;
    bool    use3D        = true;
    bool    debugOverlay = false;
    bool    initialized  = false;
};

PacRenderer::PacRenderer()  : m_impl(std::make_unique<Impl>()) {}
PacRenderer::~PacRenderer() { Shutdown(); }

// ─── Lifecycle ────────────────────────────────────────────────────────────────

bool PacRenderer::Initialize(void* windowHandle, uint32_t width, uint32_t height) {
    m_impl->vkCtx = std::make_unique<VulkanContext>();
    if (!m_impl->vkCtx->Initialize(windowHandle, width, height)) {
        std::fprintf(stderr, "[PacRenderer] VulkanContext::Initialize failed\n");
        return false;
    }
    m_impl->scene = std::make_unique<RenderScene>();
    m_impl->initialized = true;
    std::printf("[PacRenderer] Initialized (%ux%u)\n", width, height);
    return true;
}

void PacRenderer::Shutdown() {
    if (!m_impl->initialized) return;
    m_impl->scene.reset();
    if (m_impl->vkCtx) m_impl->vkCtx->Shutdown();
    m_impl->initialized = false;
    std::printf("[PacRenderer] Shut down\n");
}

void PacRenderer::BeginFrame() {
    if (!m_impl->initialized) return;
    m_impl->vkCtx->BeginFrame();
}

void PacRenderer::Render() {
    if (!m_impl->initialized) return;
    m_impl->scene->Render();
    m_impl->vkCtx->Present();
}

void PacRenderer::EndFrame() {}

// ─── PacAi Import Pipeline ────────────────────────────────────────────────────

bool PacRenderer::ImportPacAiExport(const std::string& exportFolderPath) {
    std::printf("[PacRenderer] ImportPacAiExport: %s\n", exportFolderPath.c_str());

    if (!fs::exists(exportFolderPath)) {
        std::fprintf(stderr, "[PacRenderer] Export folder not found: %s\n",
                     exportFolderPath.c_str());
        return false;
    }

    // 1. Ensure assets/ directory exists; seed it with placeholder stubs so the
    //    scene is never completely empty while real glTF files are being authored.
    const fs::path assetsDir = fs::path(exportFolderPath) / "assets";
    if (!fs::exists(assetsDir)) {
        std::error_code ec;
        fs::create_directories(assetsDir, ec);
        if (ec)
            std::fprintf(stderr, "[PacRenderer] Warning: could not create assets dir: %s\n",
                         ec.message().c_str());
        else
            std::printf("[PacRenderer] Created assets directory: %s\n",
                        assetsDir.string().c_str());
    }
    CreatePlaceholderAssets(assetsDir);

    // 2. Load visual_manifest.json — soft-fail: a missing manifest lets the
    //    simulation data still be consumed.
    const std::string manifestPath = exportFolderPath + "/visual_manifest.json";
    VisualManifest manifest;
    const bool manifestOk = VisualManifestLoader::Load(manifestPath, manifest);
    if (!manifestOk)
        std::fprintf(stderr, "[PacRenderer] visual_manifest.json missing or invalid — "
                     "rendering with defaults\n");

    // 3. Clear any previously imported scene state.
    m_impl->scene->ClearLights();

    if (manifestOk) {
        // 4. Apply environment (sky, fog, sun)
        m_impl->scene->SetEnvironment(ToEnvironmentData(manifest.environment));

        // 5. Apply lights
        for (const auto& vl : manifest.lights)
            m_impl->scene->AddLight(ToLightData(vl));

        // 6. Apply GI settings
        {
            GiSettings gi;
            const auto& vgi = manifest.global_illumination;
            if      (vgi.gi_type == "none")   gi.giType = GiType::None;
            else if (vgi.gi_type == "voxel")  gi.giType = GiType::Voxel;
            else if (vgi.gi_type == "hybrid") gi.giType = GiType::Hybrid;
            else                              gi.giType = GiType::ProbeGrid;
            gi.probeDensity = (vgi.probe_density == "low") ? 0
                            : (vgi.probe_density == "high") ? 2 : 1;
            m_impl->scene->SetGi(gi);
        }

        // 7. Apply post-processing
        {
            PostProcessSettings pp;
            const auto& vpp = manifest.post_processing;
            if      (vpp.tonemap == "filmic") pp.tonemap = Tonemap::Filmic;
            else if (vpp.tonemap == "linear") pp.tonemap = Tonemap::Linear;
            else                              pp.tonemap = Tonemap::Aces;
            pp.bloomIntensity = vpp.bloom_intensity;
            pp.exposure       = vpp.exposure;
            m_impl->scene->SetPostProcess(pp);
        }

        // 8. Load static meshes from manifest
        LoadStaticMeshes(manifest, exportFolderPath);

        // 9. Load entity proxies from manifest
        LoadVisualEntities(manifest, exportFolderPath);

        // 10. Apply camera default
        SetCamera(manifest.camera_default.position, manifest.camera_default.target);
    }

    // 11. Load world.pacdata.json — soft-fail so visual import still works when
    //     only a visual_manifest.json is present.
    {
        const std::string pacdataPath = exportFolderPath + "/world.pacdata.json";
        PacDataWorld world;
        if (PacDataLoader::Load(pacdataPath, world)) {
            std::printf("[PacRenderer] PacData loaded — entities: %zu  shards: %zu\n",
                        world.entities.size(), world.shards.size());
            // Phase 2.5.2 — drive proxy transforms from world.entities here.
        } else {
            std::printf("[PacRenderer] No world.pacdata.json found — visual-only import\n");
        }
    }

    std::printf("[PacRenderer] Import complete — entities: %zu  static_meshes: %zu  lights: %zu\n",
                manifest.entities.size(),
                manifest.static_meshes.size(),
                manifest.lights.size());
    return true;
}

// ─── Simulation integration ───────────────────────────────────────────────────

void PacRenderer::UpdateSimulationState(const void* /*worldStateOpaque*/) {
    // Phase 2.5.2 — cast to PacDataWorld, walk dirty entities, call
    // m_impl->scene->UpdateProxyTransform(entityId, transform)
}

// ─── Camera ───────────────────────────────────────────────────────────────────

void PacRenderer::SetCamera(const PacVec3& position, const PacVec3& target, float fovDeg) {
    m_impl->camPos    = position;
    m_impl->camTarget = target;
    m_impl->camFov    = fovDeg;
    // Phase 2.5.1 — push to Vulkan camera UBO
}

// ─── Viewport mode ────────────────────────────────────────────────────────────

void PacRenderer::SetViewportMode(bool use3D) {
    m_impl->use3D = use3D;
    std::printf("[PacRenderer] Viewport mode: %s\n", use3D ? "3D atmospheric" : "2D ortho");
}

bool PacRenderer::IsUsing3D() const { return m_impl->use3D; }

// ─── Utilities ────────────────────────────────────────────────────────────────

void PacRenderer::Resize(uint32_t width, uint32_t height) {
    if (m_impl->vkCtx) m_impl->vkCtx->Resize(width, height);
}

void PacRenderer::ToggleDebugOverlay(bool enabled) {
    m_impl->debugOverlay = enabled;
}

RenderScene* PacRenderer::GetScene() const { return m_impl->scene.get(); }

// ─── Import helpers ───────────────────────────────────────────────────────────

void PacRenderer::CreatePlaceholderAssets(const fs::path& assetsDir) {
    // Minimal valid glTF 2.0 JSON — enough for the loader to open without error.
    constexpr const char* kMinimalGltf =
        "{\"asset\":{\"version\":\"2.0\"},\"scene\":0,"
        "\"scenes\":[{\"nodes\":[]}],\"nodes\":[]}";

    auto ensurePlaceholder = [&](const fs::path& relPath) {
        const fs::path full = assetsDir / relPath;
        std::error_code ec;
        fs::create_directories(full.parent_path(), ec);
        if (!fs::exists(full)) {
            std::ofstream f(full);
            if (f) {
                f << kMinimalGltf;
                std::printf("[PacRenderer] Placeholder created: %s\n",
                            full.string().c_str());
            }
        }
    };

    ensurePlaceholder("models/agent.gltf");
    ensurePlaceholder("models/terrain/arena.gltf");
}

void PacRenderer::LoadVisualEntities(const VisualManifest& manifest,
                                     const std::string& exportFolderPath) {
    // manifest.entities is std::vector<VisualEntityOverride> — each entry has
    // an integer .id and a .render sub-struct.
    for (const auto& entityData : manifest.entities) {
        auto* proxy = m_impl->scene->CreateProxy(static_cast<uint64_t>(entityData.id));
        if (!proxy) continue;

        proxy->visible        = entityData.render.visible;
        proxy->castShadows    = entityData.render.cast_shadows;
        proxy->receiveShadows = entityData.render.receive_shadows;

        if (!entityData.render.asset.empty()) {
            const std::string fullPath = exportFolderPath + "/" + entityData.render.asset;
            auto loaded = m_impl->gltfLoader.LoadFile(fullPath);
            if (loaded.success && !loaded.meshes.empty()) {
                proxy->mesh = loaded.meshes[0].get();
                m_impl->scene->RegisterMesh(loaded.meshes[0]);
                if (!loaded.materials.empty()) {
                    proxy->material = loaded.materials[0].get();
                    m_impl->scene->RegisterMaterial(loaded.materials[0]);
                }
            }
            ApplyMaterialOverrides(proxy, entityData.render.material_overrides);
        }
    }
    std::printf("[PacRenderer] Loaded %zu entity proxies\n", manifest.entities.size());
}

void PacRenderer::LoadStaticMeshes(const VisualManifest& manifest,
                                   const std::string& exportFolderPath) {
    for (const auto& meshData : manifest.static_meshes) {
        auto* proxy = m_impl->scene->CreateProxy(HashMeshId(meshData.id));
        if (!proxy) continue;

        proxy->castShadows    = true;
        proxy->receiveShadows = true;

        if (!meshData.asset.empty()) {
            const std::string fullPath = exportFolderPath + "/" + meshData.asset;
            auto loaded = m_impl->gltfLoader.LoadFile(fullPath);
            if (loaded.success && !loaded.meshes.empty()) {
                proxy->mesh = loaded.meshes[0].get();
                m_impl->scene->RegisterMesh(loaded.meshes[0]);
                if (!loaded.materials.empty()) {
                    proxy->material = loaded.materials[0].get();
                    m_impl->scene->RegisterMaterial(loaded.materials[0]);
                }
            }
        }
        // Phase 2.5.1 — apply TRS transform from meshData.transform
    }
    std::printf("[PacRenderer] Loaded %zu static mesh proxies\n", manifest.static_meshes.size());
}

void PacRenderer::ApplyMaterialOverrides(
    RenderProxy* proxy,
    const std::unordered_map<std::string, MaterialOverride>& overrides)
{
    if (!proxy || !proxy->material || overrides.empty()) return;

    // Slot "0" → primary material. Additional slots map to sub-mesh materials (Phase 2.5.2).
    auto it = overrides.find("0");
    if (it != overrides.end()) {
        const auto& mo = it->second;
        proxy->material->properties.baseColorFactor = mo.baseColorFactor;
        proxy->material->properties.metallicFactor  = mo.metallicFactor;
        proxy->material->properties.roughnessFactor = mo.roughnessFactor;
    }
}

uint64_t PacRenderer::HashMeshId(const std::string& id) {
    // FNV-1a 64-bit — stable across runs, no external dependency.
    uint64_t hash = 14695981039346656037ull;
    for (unsigned char c : id) {
        hash ^= static_cast<uint64_t>(c);
        hash *= 1099511628211ull;
    }
    // Set the high bit so static-mesh keys never collide with entity int ids.
    return hash | 0x8000'0000'0000'0000ull;
}

} // namespace pac::render
