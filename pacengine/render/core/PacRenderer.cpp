#include "PacRenderer.h"
#include "RenderScene.h"
#include "../backend/VulkanContext.h"
#include <cstdio>
#include <filesystem>

namespace pac::render {

struct PacRenderer::Impl {
    std::unique_ptr<VulkanContext> vkCtx;
    std::unique_ptr<RenderScene>   scene;
    PacVec3  camPos    = {0.f, 5.f, -10.f};
    PacVec3  camTarget = {0.f, 0.f,   0.f};
    float    camFov    = 60.f;
    bool     debugOverlay = false;
    bool     initialized  = false;
};

PacRenderer::PacRenderer()  : m_impl(std::make_unique<Impl>()) {}
PacRenderer::~PacRenderer() { Shutdown(); }

bool PacRenderer::Initialize(void* windowHandle, uint32_t width, uint32_t height) {
    m_impl->vkCtx = std::make_unique<VulkanContext>();
    if (!m_impl->vkCtx->Initialize(windowHandle, width, height)) {
        std::fprintf(stderr, "[PacRenderer] VulkanContext::Initialize failed\n");
        return false;
    }
    m_impl->scene       = std::make_unique<RenderScene>();
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

void PacRenderer::EndFrame() {
    // Reserved for post-frame work (readback, debug UI, etc.)
}

bool PacRenderer::ImportPacAiExport(const std::string& exportPath) {
    namespace fs = std::filesystem;
    std::printf("[PacRenderer] ImportPacAiExport: %s\n", exportPath.c_str());

    // Phase 2.5.2 implementation — TODO: parse pacdata + visual_manifest, create proxies
    const fs::path dir(exportPath);
    if (!fs::exists(dir)) {
        std::fprintf(stderr, "[PacRenderer] Export path does not exist: %s\n", exportPath.c_str());
        return false;
    }
    return true;
}

void PacRenderer::UpdateSimulationState(const void* /*worldStateOpaque*/) {
    // Phase 2.5.2 — push entity transform deltas to dirty proxies
}

void PacRenderer::SetCamera(const PacVec3& position, const PacVec3& target, float fovDeg) {
    m_impl->camPos    = position;
    m_impl->camTarget = target;
    m_impl->camFov    = fovDeg;
    // TODO: push to Vulkan camera UBO
}

void PacRenderer::Resize(uint32_t width, uint32_t height) {
    if (m_impl->vkCtx) m_impl->vkCtx->Resize(width, height);
}

void PacRenderer::ToggleDebugOverlay(bool enabled) {
    m_impl->debugOverlay = enabled;
}

RenderScene* PacRenderer::GetScene() const {
    return m_impl->scene.get();
}

} // namespace pac::render
