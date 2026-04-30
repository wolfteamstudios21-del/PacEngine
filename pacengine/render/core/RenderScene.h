#pragma once
#include <cstdint>
#include <memory>
#include <unordered_map>
#include <vector>
#include "render_types.h"

namespace pac::render {

class RenderProxy;
class Material;

class RenderScene {
public:
    RenderScene();
    ~RenderScene();

    // Proxy management (one proxy per simulation entity).
    RenderProxy* CreateProxy(uint64_t entityId);
    void         RemoveProxy(uint64_t entityId);
    void         UpdateProxyTransform(uint64_t entityId, const PacMat4& transform);

    // Scene-wide settings.
    void AddLight(const LightData& light);
    void ClearLights();
    void SetEnvironment(const EnvironmentData& env);
    void SetGi(const GiSettings& gi);
    void SetPostProcess(const PostProcessSettings& pp);

    // Called every frame by PacRenderer.
    void Update(float deltaTime);
    void Render();

    // Record draw commands into an already-open command buffer.
    // commandBuffer is VkCommandBuffer cast to void* (SDK-free header).
    // pipelineLayout is VkPipelineLayout cast to void*.
    // mvpMatrix is a pointer to 16 floats (column-major 4×4) for the push constant.
    // Called between BeginFrame and Present by PacRenderer.
    void RecordDrawCalls(void* commandBuffer, void* pipelineLayout,
                         const float* mvpMatrix16);

    // Scene takes shared ownership of imported meshes + materials so that
    // RenderProxy raw pointers into them never dangle.
    void RegisterMesh(std::shared_ptr<class Mesh> mesh);
    void RegisterMaterial(std::shared_ptr<Material> mat);

private:
    std::unordered_map<uint64_t, std::unique_ptr<RenderProxy>> m_proxies;
    std::vector<LightData>                                      m_lights;

    // Shared ownership pools — raw Mesh*/Material* in RenderProxy borrow from here.
    std::vector<std::shared_ptr<class Mesh>> m_meshCache;
    std::vector<std::shared_ptr<Material>>   m_materials;

    EnvironmentData     m_env;
    GiSettings          m_gi;
    PostProcessSettings m_pp;
};

} // namespace pac::render
