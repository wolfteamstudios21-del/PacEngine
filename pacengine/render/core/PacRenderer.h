#pragma once
#include <memory>
#include <string>
#include "render_types.h"

namespace pac::render {

class RenderScene;

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

    // Import a full .pacexport directory: loads both the .pacdata.json and the
    // visual_manifest.json, creates RenderProxies, and applies environment settings.
    bool ImportPacAiExport(const std::string& exportPath);

    // Called after every simulation tick (or on a fixed visual rate) with the
    // authoritative world state.  Only dirty proxies are rebuilt.
    void UpdateSimulationState(const void* worldStateOpaque);

    void SetCamera(const PacVec3& position, const PacVec3& target, float fovDeg = 60.f);
    void Resize(uint32_t width, uint32_t height);
    void ToggleDebugOverlay(bool enabled);

    RenderScene* GetScene() const;

private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace pac::render
