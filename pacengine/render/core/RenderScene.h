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

private:
    std::unordered_map<uint64_t, std::unique_ptr<RenderProxy>> m_proxies;
    std::vector<LightData>                                      m_lights;
    std::vector<std::unique_ptr<Material>>                      m_materials;
    EnvironmentData    m_env;
    GiSettings         m_gi;
    PostProcessSettings m_pp;
};

} // namespace pac::render
