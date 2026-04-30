#pragma once
#include <filesystem>
#include <memory>
#include <string>
#include <unordered_map>
#include "render_types.h"
#include "VisualManifest.h"

namespace pac::render {

class RenderScene;
class RenderProxy;

// Top-level renderer. Owns the backend (Vulkan) context and the RenderScene.
// Lifecycle: Initialize → {BeginFrame, Render, EndFrame}* → Shutdown
class PacRenderer {
public:
    PacRenderer();
    ~PacRenderer();

    // Window / surface init.  windowHandle is platform-specific (HWND / xcb_window_t / …).
    bool Initialize(void* windowHandle, uint32_t width, uint32_t height);
    void Shutdown();

    // Per-frame pump — called by the host loop (editor bridge or standalone game).
    void BeginFrame();
    void Render();
    void EndFrame();

    // ── PacAi Import Pipeline (M2.5 core) ────────────────────────────────────
    // exportFolderPath must contain visual_manifest.json.
    // Missing assets are filled with placeholder stubs; returns false only on
    // hard errors (folder not found, out-of-memory, etc.).
    bool ImportPacAiExport(const std::string& exportFolderPath);

    // ── Simulation integration ────────────────────────────────────────────────
    // Called after every simulation tick (or at a fixed visual rate).
    // worldStateOpaque is currently a type-erased pointer; cast to your
    // PacDataWorld when linking against pacengine_runtime.
    void UpdateSimulationState(const void* worldStateOpaque);

    // ── Camera ───────────────────────────────────────────────────────────────
    void SetCamera(const PacVec3& position, const PacVec3& target, float fovDeg = 60.f);

    // ── Viewport mode ─────────────────────────────────────────────────────────
    // When use3D=false the renderer outputs a flat 2D ortho pass for the debug
    // grid view. Defaults to true (3D atmospheric).
    void SetViewportMode(bool use3D);
    bool IsUsing3D() const;

    // ── Utilities ────────────────────────────────────────────────────────────
    void Resize(uint32_t width, uint32_t height);
    void ToggleDebugOverlay(bool enabled);

    RenderScene* GetScene() const;

private:
    // ── Import sub-steps ─────────────────────────────────────────────────────

    // Ensures assets/models/{agent,terrain/arena}.gltf stubs exist so the
    // scene is never entirely empty on first import.
    void CreatePlaceholderAssets(const std::filesystem::path& assetsDir);

    // Reads manifest.entities (vector of VisualEntityOverride) and creates /
    // populates a RenderProxy per entry.
    void LoadVisualEntities(const VisualManifest& manifest,
                            const std::string& exportFolderPath);

    // Reads manifest.static_meshes and creates a RenderProxy per entry,
    // keyed by a stable hash of the mesh id string.
    void LoadStaticMeshes(const VisualManifest& manifest,
                          const std::string& exportFolderPath);

    // Applies material slot overrides from the manifest to a proxy's material.
    void ApplyMaterialOverrides(
        RenderProxy* proxy,
        const std::unordered_map<std::string, MaterialOverride>& overrides);

    // Returns a stable 64-bit key for a static-mesh id string.
    // High bit is set so static-mesh ids never collide with entity int ids.
    static uint64_t HashMeshId(const std::string& id);

    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace pac::render
