#pragma once
#include <cstdint>
#include <memory>

// Vulkan-specific surface, device, swapchain, and command infrastructure.
// All Vulkan types are hidden behind the pImpl to keep the header SDK-free.
// Guard every implementation detail behind HAVE_VULKAN in the .cpp.

namespace pac::render {

class VulkanContext {
public:
    VulkanContext();
    ~VulkanContext();

    // windowHandle: platform-specific (XCB window* on Linux, HWND on Windows).
    // Pass nullptr to skip surface/swapchain creation (headless / stub mode).
    bool Initialize(void* windowHandle, uint32_t width, uint32_t height);
    void Shutdown();

    // Per-frame pump.
    // BeginFrame: acquire swapchain image, reset + begin command buffer.
    // Present:    end command buffer, submit to graphics queue, present.
    void BeginFrame();
    void Present();

    // Recreates swapchain when the window is resized.
    void Resize(uint32_t width, uint32_t height);

    uint32_t Width()  const { return m_width; }
    uint32_t Height() const { return m_height; }

    // Returns true when a real GPU device was acquired (HAVE_VULKAN + SDK found
    // at runtime).  False means the stub no-op path is active.
    bool IsGpuActive() const { return m_gpuActive; }

private:
    uint32_t m_width     = 0;
    uint32_t m_height    = 0;
    bool     m_initialized = false;
    bool     m_gpuActive   = false;

    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace pac::render
