#include "RenderScene.h"
#include "RenderProxy.h"
#include "Material.h"
#include <cstdio>

namespace pac::render {

RenderScene::RenderScene()  = default;
RenderScene::~RenderScene() = default;

RenderProxy* RenderScene::CreateProxy(uint64_t entityId) {
    auto proxy = std::make_unique<RenderProxy>();
    proxy->entityId = entityId;
    auto* raw = proxy.get();
    m_proxies[entityId] = std::move(proxy);
    return raw;
}

void RenderScene::RemoveProxy(uint64_t entityId) {
    m_proxies.erase(entityId);
}

void RenderScene::UpdateProxyTransform(uint64_t entityId, const PacMat4& transform) {
    auto it = m_proxies.find(entityId);
    if (it != m_proxies.end()) {
        it->second->transform = transform;
    }
}

void RenderScene::AddLight(const LightData& light) {
    m_lights.push_back(light);
}

void RenderScene::ClearLights() {
    m_lights.clear();
}

void RenderScene::SetEnvironment(const EnvironmentData& env) {
    m_env = env;
}

void RenderScene::SetGi(const GiSettings& gi) {
    m_gi = gi;
}

void RenderScene::SetPostProcess(const PostProcessSettings& pp) {
    m_pp = pp;
}

void RenderScene::Update(float /*deltaTime*/) {
    // Phase 2.5.2 — animation, skinning, LOD selection
}

void RenderScene::Render() {
    // Phase 2.5.1 — issue draw calls per proxy via Vulkan pipeline
    // Phase 2.5.2 — sort by material, apply environment / GI / post-process
    for (auto& [id, proxy] : m_proxies) {
        if (!proxy->visible) continue;
        (void)id;
        // TODO: bind material pipeline, push transform, draw mesh
    }
}

} // namespace pac::render
