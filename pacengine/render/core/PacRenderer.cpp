#include "PacRenderer.h"
#include "RenderScene.h"
#include "RenderProxy.h"
#include "VisualManifestLoader.h"
#include "PacDataLoader.h"
#include "../importer/PacWorldImporter.h"
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

// ─── Convenience wrapper ──────────────────────────────────────────────────────
// Delegates the full import pipeline to PacWorldImporter, which also handles
// folder preparation and (Phase M3) simulation loading.
// Prefer using PacWorldImporter directly when you also have a PacSimulation*.

bool PacRenderer::ImportPacAiExport(const std::string& exportFolderPath) {
    PacWorldImporter importer(this);
    return importer.Import(exportFolderPath);
}

// ─── Pure visual API ──────────────────────────────────────────────────────────

bool PacRenderer::ApplyVisualManifest(const VisualManifest& manifest,
                                      const std::string& exportFolderPath) {
    if (!m_impl->scene) {
        std::fprintf(stderr, "[PacRenderer] ApplyVisualManifest: scene not initialised\n");
        return false;
    }

    // Clear previous lights before applying new environment.
    m_impl->scene->ClearLights();

    // Environment (sky, fog, sun colour, ambient intensity).
    m_impl->scene->SetEnvironment(ToEnvironmentData(manifest.environment));

    // Punctual lights.
    for (const auto& vl : manifest.lights)
        m_impl->scene->AddLight(ToLightData(vl));

    // Global illumination settings.
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

    // Post-processing settings.
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

    // Static environment meshes.
    LoadStaticMeshes(manifest, exportFolderPath);

    // Dynamic entity proxies.
    LoadVisualEntities(manifest, exportFolderPath);

    // Camera.
    SetCamera(manifest.camera_default.position, manifest.camera_default.target);

    std::printf("[PacRenderer] ApplyVisualManifest complete — "
                "entities: %zu  static_meshes: %zu  lights: %zu\n",
                manifest.entities.size(),
                manifest.static_meshes.size(),
                manifest.lights.size());
    return true;
}

// ─── Simulation integration ───────────────────────────────────────────────────

void PacRenderer::UpdateSimulationState(const PacDataWorld& world) {
    if (!m_impl->scene) return;

    for (const auto& ent : world.entities) {
        // Phase 2.5.2 — build a PacMat4 from ent.transform and push to the proxy:
        // m_impl->scene->UpdateProxyTransform(ent.id, BuildTransform(ent.transform));
        (void)ent;
    }
}

// ─── Camera ───────────────────────────────────────────────────────────────────

void PacRenderer::SetCamera(const PacVec3& position, const PacVec3& target, float fovDeg) {
    m_impl->camPos    = position;
    m_impl->camTarget = target;
    m_impl->camFov    = fovDeg;
    // Phase 2.5.1 — push to Vulkan camera UBO.
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

// ─── Private import sub-steps ─────────────────────────────────────────────────

void PacRenderer::LoadVisualEntities(const VisualManifest& manifest,
                                     const std::string& exportFolderPath) {
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
        // Phase 2.5.1 — apply TRS from meshData.transform
    }
    std::printf("[PacRenderer] Loaded %zu static mesh proxies\n", manifest.static_meshes.size());
}

void PacRenderer::ApplyMaterialOverrides(
    RenderProxy* proxy,
    const std::unordered_map<std::string, MaterialOverride>& overrides)
{
    if (!proxy || !proxy->material || overrides.empty()) return;

    // Slot "0" → primary material; additional slots map to sub-mesh materials (Phase 2.5.2).
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
    // High bit set so static-mesh keys never collide with entity int ids.
    return hash | 0x8000'0000'0000'0000ull;
}

} // namespace pac::render
