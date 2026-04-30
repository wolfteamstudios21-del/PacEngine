#include "VulkanContext.h"
#include <cstdio>

namespace pac::render {

VulkanContext::VulkanContext()  = default;
VulkanContext::~VulkanContext() { Shutdown(); }

bool VulkanContext::Initialize(void* /*windowHandle*/, uint32_t width, uint32_t height) {
    m_width  = width;
    m_height = height;
    std::printf("[VulkanContext] Initialize %ux%u (stub — Phase 2.5.1)\n", width, height);
    // Phase 2.5.1 checklist:
    //  1. vk::createInstance with validation layers (debug) or none (release)
    //  2. Select physical device (prefer discrete GPU)
    //  3. Create logical device + queues (graphics, present, transfer)
    //  4. Create surface from windowHandle (VK_KHR_surface + platform extension)
    //  5. Create swapchain + image views
    //  6. Create render pass + framebuffers
    //  7. Create command pools + sync primitives
    m_initialized = true;
    return true;
}

void VulkanContext::Shutdown() {
    if (!m_initialized) return;
    std::printf("[VulkanContext] Shutdown\n");
    // Phase 2.5.1 — destroy in reverse order of creation
    m_initialized = false;
}

void VulkanContext::BeginFrame() {
    // Acquire next swapchain image, wait on fence
}

void VulkanContext::Present() {
    // Submit command buffer, present swapchain image
}

void VulkanContext::Resize(uint32_t width, uint32_t height) {
    m_width  = width;
    m_height = height;
    std::printf("[VulkanContext] Resize %ux%u\n", width, height);
    // Recreate swapchain (Phase 2.5.1)
}

} // namespace pac::render
