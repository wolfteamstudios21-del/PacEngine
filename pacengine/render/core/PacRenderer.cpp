#include "PacRenderer.h"
#include "RenderScene.h"
#include "RenderProxy.h"
#include "VisualManifestLoader.h"
#include "../backend/VulkanContext.h"
#include "../assets/GltfLoader.h"

#include <cstdio>
#include <filesystem>
#include <unordered_map>

namespace pac::render {

struct PacRenderer::Impl {
    std::unique_ptr<VulkanContext> vkCtx;
    std::unique_ptr<RenderScene>   scene;
    GltfLoader                     gltfLoader;

    PacVec3 camPos    = {0.f, 5.f, -10.f};
    PacVec3 camTarget = {0.f, 0.f,   0.f};
    float   camFov    = 60.f;
    bool    use3D     = true;
    bool    debugOverlay  = false;
    bool    initialized   = false;
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
    namespace fs = std::filesystem;

    std::printf("[PacRenderer] ImportPacAiExport: %s\n", exportFolderPath.c_str());

    if (!fs::exists(exportFolderPath)) {
        std::fprintf(stderr, "[PacRenderer] Export folder not found: %s\n",
                     exportFolderPath.c_str());
        return false;
    }

    // 1. Load visual_manifest.json ─────────────────────────────────────────────
    const std::string manifestPath = exportFolderPath + "/visual_manifest.json";
    VisualManifest manifest;
    if (!VisualManifestLoader::Load(manifestPath, manifest)) {
        std::fprintf(stderr, "[PacRenderer] Failed to load visual_manifest.json\n");
        return false;
    }

    // Clear any previously imported scene state.
    m_impl->scene->ClearLights();

    // 2. Apply environment (sky, fog, sun) ─────────────────────────────────────
    m_impl->scene->SetEnvironment(ToEnvironmentData(manifest.environment));

    // 3. Apply lights ──────────────────────────────────────────────────────────
    for (const auto& vl : manifest.lights) {
        m_impl->scene->AddLight(ToLightData(vl));
    }

    // 4. Apply GI settings ─────────────────────────────────────────────────────
    {
        GiSettings gi;
        const auto& vgi = manifest.global_illumination;
        if      (vgi.gi_type == "none")       gi.giType = GiType::None;
        else if (vgi.gi_type == "voxel")      gi.giType = GiType::Voxel;
        else if (vgi.gi_type == "hybrid")     gi.giType = GiType::Hybrid;
        else                                  gi.giType = GiType::ProbeGrid;
        if      (vgi.probe_density == "low")  gi.probeDensity = 0;
        else if (vgi.probe_density == "high") gi.probeDensity = 2;
        else                                  gi.probeDensity = 1;
        m_impl->scene->SetGi(gi);
    }

    // 5. Apply post-processing ─────────────────────────────────────────────────
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

    // 6. Load static meshes ────────────────────────────────────────────────────
    for (const auto& meshData : manifest.static_meshes) {
        // Use a stable hash of the id string as entity key.
        const auto entityKey = static_cast<uint64_t>(
            std::hash<std::string>{}(meshData.id) & 0x0FFF'FFFF'FFFF'FFFFull
        ) | 0x8000'0000'0000'0000ull; // high bit marks static meshes

        auto* proxy = m_impl->scene->CreateProxy(entityKey);
        if (!proxy) continue;

        proxy->castShadows    = true;
        proxy->receiveShadows = true;

        if (!meshData.asset.empty()) {
            const std::string fullPath = exportFolderPath + "/" + meshData.asset;
            auto loaded = m_impl->gltfLoader.LoadFile(fullPath);
            if (loaded.success && !loaded.meshes.empty()) {
                // Scene takes shared ownership; proxy borrows a raw pointer.
                proxy->mesh = loaded.meshes[0].get();
                m_impl->scene->RegisterMesh(loaded.meshes[0]);
                if (!loaded.materials.empty()) {
                    proxy->material = loaded.materials[0].get();
                    m_impl->scene->RegisterMaterial(loaded.materials[0]);
                }
            }
        }
        // Apply transform (Phase 2.5.1 — build PacMat4 from TRS)
        // proxy->transform = TRSToMat4(meshData.transform.position,
        //                              meshData.transform.rotation,
        //                              meshData.transform.scale);
    }

    // 7. Load entity proxies ───────────────────────────────────────────────────
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

    // 8. Apply camera default ──────────────────────────────────────────────────
    SetCamera(manifest.camera_default.position, manifest.camera_default.target);

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

bool PacRenderer::IsUsing3D() const {
    return m_impl->use3D;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

void PacRenderer::Resize(uint32_t width, uint32_t height) {
    if (m_impl->vkCtx) m_impl->vkCtx->Resize(width, height);
}

void PacRenderer::ToggleDebugOverlay(bool enabled) {
    m_impl->debugOverlay = enabled;
}

RenderScene* PacRenderer::GetScene() const {
    return m_impl->scene.get();
}

// ─── Private helpers ──────────────────────────────────────────────────────────

void PacRenderer::ApplyMaterialOverrides(
    RenderProxy* proxy,
    const std::unordered_map<std::string, MaterialOverride>& overrides)
{
    if (!proxy || !proxy->material || overrides.empty()) return;

    // Phase 2.5.2 — look up each slot override and patch the material.
    // Slot "0" maps to material->properties on the primary material.
    auto it = overrides.find("0");
    if (it != overrides.end()) {
        const auto& mo = it->second;
        proxy->material->properties.baseColorFactor = mo.baseColorFactor;
        proxy->material->properties.metallicFactor  = mo.metallicFactor;
        proxy->material->properties.roughnessFactor = mo.roughnessFactor;
    }
    // Additional slots would map to sub-mesh materials (Phase 2.5.2).
}

} // namespace pac::render
