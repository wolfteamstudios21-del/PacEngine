#pragma once
#include <cstdint>
#include <memory>

// Vulkan surface, device, swapchain, and command infrastructure.
// All Vulkan types are hidden behind pImpl to keep the header SDK-free.
// Guard every Vulkan detail behind HAVE_VULKAN in the .cpp.

namespace pac::render {

class VulkanContext {
public:
    VulkanContext();
    ~VulkanContext();

    // windowHandle: platform-specific (XCB pair on Linux, HWND on Windows).
    // Pass nullptr for headless / stub mode.
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

    // Returns true when a real GPU device was acquired.
    // False means the stub no-op path is active.
    bool IsGpuActive() const { return m_gpuActive; }

    // ── GPU memory helpers (HAVE_VULKAN only — no-op in stub) ────────────────
    // Creates a host-visible, host-coherent buffer and copies data into it.
    // outBuffer / outMemory are VkBuffer / VkDeviceMemory cast to uint64_t.
    // Returns false if the GPU is not active or allocation fails.
    bool AllocateHostBuffer(const void* data, size_t size, uint32_t vkUsageFlags,
                            uint64_t* outBuffer, uint64_t* outMemory);

    void FreeHostBuffer(uint64_t vkBuffer, uint64_t vkMemory);

    // The command buffer currently open for this frame.
    // Cast to VkCommandBuffer inside HAVE_VULKAN code.
    void* GetCurrentCommandBuffer() const;

    // The pipeline layout (for push constants).
    // Cast to VkPipelineLayout inside HAVE_VULKAN code.
    void* GetPipelineLayout() const;

private:
    uint32_t m_width       = 0;
    uint32_t m_height      = 0;
    bool     m_initialized = false;
    bool     m_gpuActive   = false;

    struct Impl;
    std::unique_ptr<Impl> m_impl;
};

} // namespace pac::render
