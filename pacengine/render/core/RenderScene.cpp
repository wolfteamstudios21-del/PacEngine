#include "RenderScene.h"
#include "RenderProxy.h"
#include "Material.h"
#include "Mesh.h"
#include "../backend/VulkanContext.h"
#include <cstdio>

#if defined(HAVE_VULKAN)
#include <vulkan/vulkan.h>
#endif

namespace pac::render {

RenderScene::RenderScene()  = default;

RenderScene::~RenderScene() {
    if (!m_vkCtx) return;
    for (auto& mesh : m_meshCache) {
        if (!mesh) continue;
        for (auto& prim : mesh->primitives) {
            if (prim.vertexBufferHandle)
                m_vkCtx->FreeHostBuffer(prim.vertexBufferHandle, prim.vertexMemoryHandle);
            if (prim.indexBufferHandle)
                m_vkCtx->FreeHostBuffer(prim.indexBufferHandle, prim.indexMemoryHandle);
            prim.vertexBufferHandle = prim.vertexMemoryHandle = 0;
            prim.indexBufferHandle  = prim.indexMemoryHandle  = 0;
        }
    }
}

void RenderScene::SetVulkanContext(VulkanContext* ctx) {
    m_vkCtx = ctx;
}

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

void RenderScene::RegisterMesh(std::shared_ptr<Mesh> mesh) {
    if (mesh) m_meshCache.push_back(std::move(mesh));
}

void RenderScene::RegisterMaterial(std::shared_ptr<Material> mat) {
    if (mat) m_materials.push_back(std::move(mat));
}

void RenderScene::Update(float /*deltaTime*/) {
    // Phase 2.5.2 — animation, skinning, LOD selection
}

void RenderScene::Render() {
    // Intentional no-op: RenderScene::Render() is superseded by
    // PacRenderer::Render() which calls RecordDrawCalls with the live
    // command buffer and current MVP matrix.
    // Kept for API compatibility; remove in Phase M3 host-loop refactor.
}

void RenderScene::RecordDrawCalls(void* commandBuffer, void* pipelineLayout,
                                   const float* mvpMatrix16) {
    if (!commandBuffer) return;  // Stub backend or no active frame

#if defined(HAVE_VULKAN)
    auto cmd    = static_cast<VkCommandBuffer>(commandBuffer);
    auto layout = static_cast<VkPipelineLayout>(pipelineLayout);

    // Push MVP matrix (64 bytes) as a push constant to the vertex shader.
    if (layout && mvpMatrix16)
        vkCmdPushConstants(cmd, layout, VK_SHADER_STAGE_VERTEX_BIT, 0, 64, mvpMatrix16);

    uint32_t drawCount = 0;
    for (auto& [id, proxy] : m_proxies) {
        if (!proxy->visible || !proxy->mesh) continue;
        (void)id;

        for (const auto& prim : proxy->mesh->primitives) {
            // Skip primitives whose GPU buffers haven't been uploaded yet.
            if (prim.vertexBufferHandle == 0 || prim.indexBufferHandle == 0) continue;

            auto vb = reinterpret_cast<VkBuffer>(
                static_cast<uintptr_t>(prim.vertexBufferHandle));
            auto ib = reinterpret_cast<VkBuffer>(
                static_cast<uintptr_t>(prim.indexBufferHandle));

            const VkDeviceSize offset = 0;
            vkCmdBindVertexBuffers(cmd, 0, 1, &vb, &offset);
            vkCmdBindIndexBuffer(cmd, ib, 0, VK_INDEX_TYPE_UINT32);
            vkCmdDrawIndexed(cmd,
                static_cast<uint32_t>(prim.indices.size()),
                1,   // instanceCount
                0,   // firstIndex
                0,   // vertexOffset
                0);  // firstInstance
            ++drawCount;
        }
    }

    if (drawCount > 0)
        std::printf("[RenderScene] Recorded %u draw call(s)\n", drawCount);
#else
    // Stub: count draw-capable proxies for diagnostics
    uint32_t ready = 0;
    for (auto& [id, proxy] : m_proxies) {
        if (!proxy->visible || !proxy->mesh) continue;
        (void)id;
        for (const auto& prim : proxy->mesh->primitives) {
            if (prim.vertexBufferHandle != 0) ++ready;
        }
    }
    (void)commandBuffer; (void)pipelineLayout; (void)mvpMatrix16;
    (void)ready;
#endif
}

} // namespace pac::render
