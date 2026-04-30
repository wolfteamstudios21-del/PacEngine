#pragma once
#include <cstdint>

// Vulkan-specific surface, device, swapchain, and command infrastructure.
// Phase 2.5.1 — implement using Vulkan-HPP + vkguide.dev patterns.
// Guard every Vulkan type behind HAVE_VULKAN so the skeleton compiles without
// the Vulkan SDK present.

#if defined(HAVE_VULKAN)
#include <vulkan/vulkan.hpp>
#endif

namespace pac::render {

class VulkanContext {
public:
    VulkanContext();
    ~VulkanContext();

    bool Initialize(void* windowHandle, uint32_t width, uint32_t height);
    void Shutdown();

    void BeginFrame();
    void Present();
    void Resize(uint32_t width, uint32_t height);

    uint32_t Width()  const { return m_width; }
    uint32_t Height() const { return m_height; }

private:
    uint32_t m_width  = 0;
    uint32_t m_height = 0;
    bool     m_initialized = false;

#if defined(HAVE_VULKAN)
    // Filled in Phase 2.5.1:
    // vk::Instance       m_instance;
    // vk::SurfaceKHR     m_surface;
    // vk::PhysicalDevice m_physicalDevice;
    // vk::Device         m_device;
    // vk::SwapchainKHR   m_swapchain;
    // ...
#endif
};

} // namespace pac::render
