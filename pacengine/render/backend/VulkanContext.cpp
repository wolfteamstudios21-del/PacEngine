#include "VulkanContext.h"
#include <cstdio>
#include <cstring>

// ─── Vulkan implementation (compiled only when SDK is present) ────────────────
#if defined(HAVE_VULKAN)

#include <vulkan/vulkan.h>

// XCB surface on Linux; HWND on Windows (Phase 2.5.1 — add VK_KHR_win32_surface).
#if defined(__linux__)
#  include <xcb/xcb.h>
#  include <vulkan/vulkan_xcb.h>
#endif

#include <algorithm>
#include <array>
#include <cstdlib>
#include <fstream>
#include <filesystem>
#include <limits>
#include <optional>
#include <string>
#include <vector>

namespace pac::render {
namespace fs = std::filesystem;

// ─── Macros ───────────────────────────────────────────────────────────────────

#define VK_CHECK(call)                                                  \
    do {                                                                \
        VkResult _res = (call);                                         \
        if (_res != VK_SUCCESS) {                                       \
            std::fprintf(stderr, "[VulkanContext] %s failed: %d (%s:%d)\n", \
                         #call, _res, __FILE__, __LINE__);              \
            return false;                                               \
        }                                                               \
    } while (0)

#define VK_CHECK_V(call)                                                \
    do {                                                                \
        VkResult _res = (call);                                         \
        if (_res != VK_SUCCESS)                                         \
            std::fprintf(stderr, "[VulkanContext] %s failed: %d\n", #call, _res); \
    } while (0)

// ─── Impl ─────────────────────────────────────────────────────────────────────

static constexpr uint32_t MAX_FRAMES_IN_FLIGHT = 2;

struct VulkanContext::Impl {
    // Core objects
    VkInstance               instance        = VK_NULL_HANDLE;
    VkDebugUtilsMessengerEXT debugMessenger  = VK_NULL_HANDLE;
    VkPhysicalDevice         physDev         = VK_NULL_HANDLE;
    VkDevice                 device          = VK_NULL_HANDLE;
    VkQueue                  graphicsQueue   = VK_NULL_HANDLE;
    VkQueue                  presentQueue    = VK_NULL_HANDLE;
    uint32_t                 graphicsFamily  = UINT32_MAX;
    uint32_t                 presentFamily   = UINT32_MAX;

    // Surface & swapchain (null when running headless)
    VkSurfaceKHR             surface         = VK_NULL_HANDLE;
    VkSwapchainKHR           swapchain       = VK_NULL_HANDLE;
    VkFormat                 swapFormat      = VK_FORMAT_UNDEFINED;
    VkExtent2D               swapExtent      = {0, 0};
    std::vector<VkImage>     swapImages;
    std::vector<VkImageView> swapImageViews;

    // Render pass & framebuffers
    VkRenderPass               renderPass    = VK_NULL_HANDLE;
    std::vector<VkFramebuffer> framebuffers;

    // Pipeline
    VkPipelineLayout pipelineLayout = VK_NULL_HANDLE;
    VkPipeline       pipeline       = VK_NULL_HANDLE;

    // Command infrastructure
    VkCommandPool commandPool = VK_NULL_HANDLE;
    std::array<VkCommandBuffer, MAX_FRAMES_IN_FLIGHT> cmdBufs   = {};
    std::array<VkSemaphore,     MAX_FRAMES_IN_FLIGHT> imgAvail  = {};
    std::array<VkSemaphore,     MAX_FRAMES_IN_FLIGHT> renderDone= {};
    std::array<VkFence,         MAX_FRAMES_IN_FLIGHT> inFlight  = {};

    uint32_t currentFrame = 0;
    uint32_t currentImage = 0;
    bool     headless     = false;  // no surface/swapchain
};

// ─── Validation-layer callback ────────────────────────────────────────────────

static VKAPI_ATTR VkBool32 VKAPI_CALL DebugCallback(
    VkDebugUtilsMessageSeverityFlagBitsEXT severity,
    VkDebugUtilsMessageTypeFlagsEXT,
    const VkDebugUtilsMessengerCallbackDataEXT* data,
    void*)
{
    if (severity >= VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT)
        std::fprintf(stderr, "[Vulkan] %s\n", data->pMessage);
    return VK_FALSE;
}

// ─── SPIR-V loader ───────────────────────────────────────────────────────────

static std::vector<uint32_t> LoadSpv(const std::string& path) {
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f.is_open()) {
        std::fprintf(stderr, "[VulkanContext] Missing SPV: %s\n", path.c_str());
        return {};
    }
    auto size = f.tellg();
    f.seekg(0);
    std::vector<uint32_t> buf(size / 4);
    f.read(reinterpret_cast<char*>(buf.data()), size);
    return buf;
}

// ─── Sub-steps (each returns bool and populates Impl) ─────────────────────────

// Returns true if name is in the list of available instance extensions.
static bool ExtensionAvailable(const char* name) {
    uint32_t count = 0;
    vkEnumerateInstanceExtensionProperties(nullptr, &count, nullptr);
    std::vector<VkExtensionProperties> props(count);
    vkEnumerateInstanceExtensionProperties(nullptr, &count, props.data());
    for (const auto& p : props)
        if (std::strcmp(p.extensionName, name) == 0) return true;
    return false;
}

// Returns true if name is in the list of available instance layers.
static bool LayerAvailable(const char* name) {
    uint32_t count = 0;
    vkEnumerateInstanceLayerProperties(&count, nullptr);
    std::vector<VkLayerProperties> props(count);
    vkEnumerateInstanceLayerProperties(&count, props.data());
    for (const auto& p : props)
        if (std::strcmp(p.layerName, name) == 0) return true;
    return false;
}

static bool CreateInstance(VulkanContext::Impl& m) {
    VkApplicationInfo appInfo{};
    appInfo.sType              = VK_STRUCTURE_TYPE_APPLICATION_INFO;
    appInfo.pApplicationName   = "PacEngine";
    appInfo.applicationVersion = VK_MAKE_VERSION(0, 2, 5);
    appInfo.pEngineName        = "PacEngine";
    appInfo.engineVersion      = VK_MAKE_VERSION(0, 2, 5);
    appInfo.apiVersion         = VK_API_VERSION_1_3;

    // ── Extensions: only add what is actually available ────────────────────────
    std::vector<const char*> extensions;
    // Surface extension is required for any rendering; skip entirely on headless.
    if (ExtensionAvailable(VK_KHR_SURFACE_EXTENSION_NAME))
        extensions.push_back(VK_KHR_SURFACE_EXTENSION_NAME);
#if defined(__linux__)
    if (ExtensionAvailable(VK_KHR_XCB_SURFACE_EXTENSION_NAME))
        extensions.push_back(VK_KHR_XCB_SURFACE_EXTENSION_NAME);
#endif
    const bool haveDebugUtils = ExtensionAvailable(VK_EXT_DEBUG_UTILS_EXTENSION_NAME);
    if (haveDebugUtils) extensions.push_back(VK_EXT_DEBUG_UTILS_EXTENSION_NAME);

    // ── Validation layer: opt-in only when available ────────────────────────────
#if defined(NDEBUG)
    const bool wantValidation = false;
#else
    const bool wantValidation = true;
#endif
    std::vector<const char*> layers;
    const bool haveValidation = wantValidation &&
        LayerAvailable("VK_LAYER_KHRONOS_validation");
    if (haveValidation) layers.push_back("VK_LAYER_KHRONOS_validation");

    VkInstanceCreateInfo ci{};
    ci.sType                   = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
    ci.pApplicationInfo        = &appInfo;
    ci.enabledExtensionCount   = static_cast<uint32_t>(extensions.size());
    ci.ppEnabledExtensionNames = extensions.data();
    ci.enabledLayerCount       = static_cast<uint32_t>(layers.size());
    ci.ppEnabledLayerNames     = layers.data();

    if (vkCreateInstance(&ci, nullptr, &m.instance) != VK_SUCCESS) {
        std::fprintf(stderr, "[VulkanContext] vkCreateInstance failed\n");
        return false;
    }

    // Attach debug messenger only if the extension was loaded.
    if (haveValidation && haveDebugUtils) {
        VkDebugUtilsMessengerCreateInfoEXT dbgCi{};
        dbgCi.sType           = VK_STRUCTURE_TYPE_DEBUG_UTILS_MESSENGER_CREATE_INFO_EXT;
        dbgCi.messageSeverity = VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT |
                                VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT;
        dbgCi.messageType     = VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT    |
                                VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT  |
                                VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT;
        dbgCi.pfnUserCallback = DebugCallback;
        auto fn = (PFN_vkCreateDebugUtilsMessengerEXT)
            vkGetInstanceProcAddr(m.instance, "vkCreateDebugUtilsMessengerEXT");
        if (fn) fn(m.instance, &dbgCi, nullptr, &m.debugMessenger);
    }
    return true;
}

static bool CreateSurface(VulkanContext::Impl& m, void* windowHandle,
                          uint32_t width, uint32_t height) {
    if (!windowHandle) {
        m.headless    = true;
        m.swapExtent  = {width, height};
        std::printf("[VulkanContext] Headless mode — no surface/swapchain\n");
        return true;
    }

#if defined(__linux__)
    // windowHandle is expected to be a struct { xcb_connection_t*, xcb_window_t }.
    struct XcbSurfaceHandle { xcb_connection_t* conn; xcb_window_t window; };
    auto* xcb = reinterpret_cast<XcbSurfaceHandle*>(windowHandle);

    VkXcbSurfaceCreateInfoKHR sci{};
    sci.sType      = VK_STRUCTURE_TYPE_XCB_SURFACE_CREATE_INFO_KHR;
    sci.connection = xcb->conn;
    sci.window     = xcb->window;
    VK_CHECK(vkCreateXcbSurfaceKHR(m.instance, &sci, nullptr, &m.surface));
#else
    // Other platforms — Phase 2.5.2 (Win32/macOS)
    m.headless   = true;
    m.swapExtent = {width, height};
    std::printf("[VulkanContext] Platform surface not implemented — headless mode\n");
#endif
    return true;
}

static bool PickPhysicalDevice(VulkanContext::Impl& m) {
    uint32_t count = 0;
    vkEnumeratePhysicalDevices(m.instance, &count, nullptr);
    if (count == 0) {
        std::fprintf(stderr, "[VulkanContext] No Vulkan-capable GPU found\n");
        return false;
    }

    std::vector<VkPhysicalDevice> devices(count);
    vkEnumeratePhysicalDevices(m.instance, &count, devices.data());

    // Prefer discrete GPU
    for (auto dev : devices) {
        VkPhysicalDeviceProperties props;
        vkGetPhysicalDeviceProperties(dev, &props);
        if (props.deviceType == VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU) {
            m.physDev = dev;
            std::printf("[VulkanContext] Selected discrete GPU: %s\n", props.deviceName);
            return true;
        }
    }
    // Fall back to first available
    m.physDev = devices[0];
    VkPhysicalDeviceProperties props;
    vkGetPhysicalDeviceProperties(m.physDev, &props);
    std::printf("[VulkanContext] Selected GPU: %s\n", props.deviceName);
    return true;
}

static bool CreateDevice(VulkanContext::Impl& m) {
    // Find graphics + present queue families
    uint32_t qfCount = 0;
    vkGetPhysicalDeviceQueueFamilyProperties(m.physDev, &qfCount, nullptr);
    std::vector<VkQueueFamilyProperties> qfs(qfCount);
    vkGetPhysicalDeviceQueueFamilyProperties(m.physDev, &qfCount, qfs.data());

    for (uint32_t i = 0; i < qfCount; ++i) {
        if (qfs[i].queueFlags & VK_QUEUE_GRAPHICS_BIT)
            m.graphicsFamily = i;

        if (m.surface != VK_NULL_HANDLE) {
            VkBool32 presentSupport = VK_FALSE;
            vkGetPhysicalDeviceSurfaceSupportKHR(m.physDev, i, m.surface, &presentSupport);
            if (presentSupport) m.presentFamily = i;
        }

        if (m.graphicsFamily != UINT32_MAX &&
            (m.headless || m.presentFamily != UINT32_MAX))
            break;
    }

    if (m.graphicsFamily == UINT32_MAX) {
        std::fprintf(stderr, "[VulkanContext] No graphics queue family found\n");
        return false;
    }
    if (m.headless) m.presentFamily = m.graphicsFamily;

    // Create queues (deduplicate families)
    const float priority = 1.0f;
    std::vector<VkDeviceQueueCreateInfo> queueCIs;
    for (uint32_t fam : {m.graphicsFamily, m.presentFamily}) {
        bool dup = false;
        for (const auto& q : queueCIs)
            if (q.queueFamilyIndex == fam) { dup = true; break; }
        if (dup) continue;
        VkDeviceQueueCreateInfo qi{};
        qi.sType            = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO;
        qi.queueFamilyIndex = fam;
        qi.queueCount       = 1;
        qi.pQueuePriorities = &priority;
        queueCIs.push_back(qi);
    }

    std::vector<const char*> exts;
    if (!m.headless) exts.push_back(VK_KHR_SWAPCHAIN_EXTENSION_NAME);

    VkPhysicalDeviceFeatures features{};

    VkDeviceCreateInfo dci{};
    dci.sType                   = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO;
    dci.queueCreateInfoCount    = static_cast<uint32_t>(queueCIs.size());
    dci.pQueueCreateInfos       = queueCIs.data();
    dci.enabledExtensionCount   = static_cast<uint32_t>(exts.size());
    dci.ppEnabledExtensionNames = exts.data();
    dci.pEnabledFeatures        = &features;
    VK_CHECK(vkCreateDevice(m.physDev, &dci, nullptr, &m.device));

    vkGetDeviceQueue(m.device, m.graphicsFamily, 0, &m.graphicsQueue);
    vkGetDeviceQueue(m.device, m.presentFamily,  0, &m.presentQueue);
    return true;
}

static bool CreateSwapchain(VulkanContext::Impl& m, uint32_t width, uint32_t height) {
    if (m.headless) return true;  // No swapchain in headless mode

    // Surface capabilities
    VkSurfaceCapabilitiesKHR caps{};
    vkGetPhysicalDeviceSurfaceCapabilitiesKHR(m.physDev, m.surface, &caps);

    // Choose format — prefer B8G8R8A8_SRGB / SRGB_NONLINEAR
    uint32_t fmtCount = 0;
    vkGetPhysicalDeviceSurfaceFormatsKHR(m.physDev, m.surface, &fmtCount, nullptr);
    std::vector<VkSurfaceFormatKHR> formats(fmtCount);
    vkGetPhysicalDeviceSurfaceFormatsKHR(m.physDev, m.surface, &fmtCount, formats.data());

    m.swapFormat = formats[0].format;
    VkColorSpaceKHR colorSpace = formats[0].colorSpace;
    for (const auto& f : formats) {
        if (f.format == VK_FORMAT_B8G8R8A8_SRGB &&
            f.colorSpace == VK_COLOR_SPACE_SRGB_NONLINEAR_KHR) {
            m.swapFormat = f.format;
            colorSpace   = f.colorSpace;
            break;
        }
    }

    // Choose present mode — prefer mailbox (triple-buffer)
    uint32_t pmCount = 0;
    vkGetPhysicalDeviceSurfacePresentModesKHR(m.physDev, m.surface, &pmCount, nullptr);
    std::vector<VkPresentModeKHR> pmodes(pmCount);
    vkGetPhysicalDeviceSurfacePresentModesKHR(m.physDev, m.surface, &pmCount, pmodes.data());
    VkPresentModeKHR presentMode = VK_PRESENT_MODE_FIFO_KHR; // guaranteed
    for (auto pm : pmodes)
        if (pm == VK_PRESENT_MODE_MAILBOX_KHR) { presentMode = pm; break; }

    // Extent
    if (caps.currentExtent.width != UINT32_MAX) {
        m.swapExtent = caps.currentExtent;
    } else {
        m.swapExtent.width  = std::clamp(width,  caps.minImageExtent.width,  caps.maxImageExtent.width);
        m.swapExtent.height = std::clamp(height, caps.minImageExtent.height, caps.maxImageExtent.height);
    }

    uint32_t imageCount = caps.minImageCount + 1;
    if (caps.maxImageCount > 0) imageCount = std::min(imageCount, caps.maxImageCount);

    VkSwapchainCreateInfoKHR sci{};
    sci.sType                 = VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR;
    sci.surface               = m.surface;
    sci.minImageCount         = imageCount;
    sci.imageFormat           = m.swapFormat;
    sci.imageColorSpace       = colorSpace;
    sci.imageExtent           = m.swapExtent;
    sci.imageArrayLayers      = 1;
    sci.imageUsage            = VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT;
    sci.preTransform          = caps.currentTransform;
    sci.compositeAlpha        = VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR;
    sci.presentMode           = presentMode;
    sci.clipped               = VK_TRUE;

    uint32_t queueFamilies[] = {m.graphicsFamily, m.presentFamily};
    if (m.graphicsFamily != m.presentFamily) {
        sci.imageSharingMode      = VK_SHARING_MODE_CONCURRENT;
        sci.queueFamilyIndexCount = 2;
        sci.pQueueFamilyIndices   = queueFamilies;
    } else {
        sci.imageSharingMode = VK_SHARING_MODE_EXCLUSIVE;
    }
    VK_CHECK(vkCreateSwapchainKHR(m.device, &sci, nullptr, &m.swapchain));

    // Retrieve images
    uint32_t imgCount = 0;
    vkGetSwapchainImagesKHR(m.device, m.swapchain, &imgCount, nullptr);
    m.swapImages.resize(imgCount);
    vkGetSwapchainImagesKHR(m.device, m.swapchain, &imgCount, m.swapImages.data());

    // Create image views
    m.swapImageViews.resize(imgCount);
    for (uint32_t i = 0; i < imgCount; ++i) {
        VkImageViewCreateInfo ivc{};
        ivc.sType                           = VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;
        ivc.image                           = m.swapImages[i];
        ivc.viewType                        = VK_IMAGE_VIEW_TYPE_2D;
        ivc.format                          = m.swapFormat;
        ivc.components                      = {VK_COMPONENT_SWIZZLE_IDENTITY,
                                               VK_COMPONENT_SWIZZLE_IDENTITY,
                                               VK_COMPONENT_SWIZZLE_IDENTITY,
                                               VK_COMPONENT_SWIZZLE_IDENTITY};
        ivc.subresourceRange.aspectMask     = VK_IMAGE_ASPECT_COLOR_BIT;
        ivc.subresourceRange.baseMipLevel   = 0;
        ivc.subresourceRange.levelCount     = 1;
        ivc.subresourceRange.baseArrayLayer = 0;
        ivc.subresourceRange.layerCount     = 1;
        VK_CHECK(vkCreateImageView(m.device, &ivc, nullptr, &m.swapImageViews[i]));
    }
    return true;
}

static bool CreateRenderPass(VulkanContext::Impl& m) {
    if (m.headless) return true;

    VkAttachmentDescription colorAttach{};
    colorAttach.format         = m.swapFormat;
    colorAttach.samples        = VK_SAMPLE_COUNT_1_BIT;
    colorAttach.loadOp         = VK_ATTACHMENT_LOAD_OP_CLEAR;
    colorAttach.storeOp        = VK_ATTACHMENT_STORE_OP_STORE;
    colorAttach.stencilLoadOp  = VK_ATTACHMENT_LOAD_OP_DONT_CARE;
    colorAttach.stencilStoreOp = VK_ATTACHMENT_STORE_OP_DONT_CARE;
    colorAttach.initialLayout  = VK_IMAGE_LAYOUT_UNDEFINED;
    colorAttach.finalLayout    = VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;

    VkAttachmentReference colorRef{0, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL};

    VkSubpassDescription subpass{};
    subpass.pipelineBindPoint    = VK_PIPELINE_BIND_POINT_GRAPHICS;
    subpass.colorAttachmentCount = 1;
    subpass.pColorAttachments    = &colorRef;

    VkSubpassDependency dep{};
    dep.srcSubpass    = VK_SUBPASS_EXTERNAL;
    dep.dstSubpass    = 0;
    dep.srcStageMask  = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
    dep.srcAccessMask = 0;
    dep.dstStageMask  = VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT;
    dep.dstAccessMask = VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT;

    VkRenderPassCreateInfo rpci{};
    rpci.sType           = VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;
    rpci.attachmentCount = 1;
    rpci.pAttachments    = &colorAttach;
    rpci.subpassCount    = 1;
    rpci.pSubpasses      = &subpass;
    rpci.dependencyCount = 1;
    rpci.pDependencies   = &dep;
    VK_CHECK(vkCreateRenderPass(m.device, &rpci, nullptr, &m.renderPass));
    return true;
}

static bool CreateFramebuffers(VulkanContext::Impl& m) {
    if (m.headless) return true;

    m.framebuffers.resize(m.swapImageViews.size());
    for (size_t i = 0; i < m.swapImageViews.size(); ++i) {
        VkFramebufferCreateInfo fci{};
        fci.sType           = VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;
        fci.renderPass      = m.renderPass;
        fci.attachmentCount = 1;
        fci.pAttachments    = &m.swapImageViews[i];
        fci.width           = m.swapExtent.width;
        fci.height          = m.swapExtent.height;
        fci.layers          = 1;
        VK_CHECK(vkCreateFramebuffer(m.device, &fci, nullptr, &m.framebuffers[i]));
    }
    return true;
}

static VkShaderModule CreateShaderModule(VkDevice dev, const std::string& path) {
    auto spv = LoadSpv(path);
    if (spv.empty()) return VK_NULL_HANDLE;

    VkShaderModuleCreateInfo smci{};
    smci.sType    = VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;
    smci.codeSize = spv.size() * 4;
    smci.pCode    = spv.data();

    VkShaderModule mod = VK_NULL_HANDLE;
    if (vkCreateShaderModule(dev, &smci, nullptr, &mod) != VK_SUCCESS)
        return VK_NULL_HANDLE;
    return mod;
}

static bool CreatePipeline(VulkanContext::Impl& m) {
    if (m.headless) return true;

    // Load SPIR-V — gracefully skip pipeline if SPV not compiled yet
#if defined(PAC_SHADER_DIR)
    const std::string vertPath = std::string(PAC_SHADER_DIR) + "/unlit.vert.spv";
    const std::string fragPath = std::string(PAC_SHADER_DIR) + "/unlit.frag.spv";
#else
    const std::string vertPath;
    const std::string fragPath;
#endif

    VkShaderModule vertMod = CreateShaderModule(m.device, vertPath);
    VkShaderModule fragMod = CreateShaderModule(m.device, fragPath);
    if (!vertMod || !fragMod) {
        std::fprintf(stderr,
            "[VulkanContext] SPIR-V missing — run glslc on shaders/unlit.vert/frag; "
            "pipeline creation skipped\n");
        if (vertMod) vkDestroyShaderModule(m.device, vertMod, nullptr);
        if (fragMod) vkDestroyShaderModule(m.device, fragMod, nullptr);
        return true;  // Non-fatal — just no draw calls until shaders are compiled
    }

    // Shader stages
    VkPipelineShaderStageCreateInfo stages[2]{};
    stages[0].sType  = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    stages[0].stage  = VK_SHADER_STAGE_VERTEX_BIT;
    stages[0].module = vertMod;
    stages[0].pName  = "main";
    stages[1].sType  = VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;
    stages[1].stage  = VK_SHADER_STAGE_FRAGMENT_BIT;
    stages[1].module = fragMod;
    stages[1].pName  = "main";

    // Vertex input — matches Vertex in Mesh.h
    VkVertexInputBindingDescription binding{};
    binding.binding   = 0;
    binding.stride    = sizeof(float) * (3 + 3 + 2 + 4);  // pos + norm + uv + tangent
    binding.inputRate = VK_VERTEX_INPUT_RATE_VERTEX;

    VkVertexInputAttributeDescription attribs[3]{};
    attribs[0] = {0, 0, VK_FORMAT_R32G32B32_SFLOAT, 0};                     // position
    attribs[1] = {1, 0, VK_FORMAT_R32G32B32_SFLOAT, sizeof(float) * 3};     // normal
    attribs[2] = {2, 0, VK_FORMAT_R32G32_SFLOAT,    sizeof(float) * 6};     // uv

    VkPipelineVertexInputStateCreateInfo vis{};
    vis.sType                           = VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;
    vis.vertexBindingDescriptionCount   = 1;
    vis.pVertexBindingDescriptions      = &binding;
    vis.vertexAttributeDescriptionCount = 3;
    vis.pVertexAttributeDescriptions    = attribs;

    VkPipelineInputAssemblyStateCreateInfo ias{};
    ias.sType    = VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;
    ias.topology = VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;

    VkViewport viewport{0.f, 0.f,
                        static_cast<float>(m.swapExtent.width),
                        static_cast<float>(m.swapExtent.height),
                        0.f, 1.f};
    VkRect2D scissor{{0, 0}, m.swapExtent};
    VkPipelineViewportStateCreateInfo vs{};
    vs.sType         = VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;
    vs.viewportCount = 1; vs.pViewports = &viewport;
    vs.scissorCount  = 1; vs.pScissors  = &scissor;

    VkPipelineRasterizationStateCreateInfo rs{};
    rs.sType       = VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;
    rs.polygonMode = VK_POLYGON_MODE_FILL;
    rs.cullMode    = VK_CULL_MODE_BACK_BIT;
    rs.frontFace   = VK_FRONT_FACE_COUNTER_CLOCKWISE;
    rs.lineWidth   = 1.f;

    VkPipelineMultisampleStateCreateInfo ms{};
    ms.sType                = VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;
    ms.rasterizationSamples = VK_SAMPLE_COUNT_1_BIT;

    VkPipelineColorBlendAttachmentState blendAttach{};
    blendAttach.colorWriteMask = VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT |
                                 VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT;

    VkPipelineColorBlendStateCreateInfo blend{};
    blend.sType           = VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;
    blend.attachmentCount = 1;
    blend.pAttachments    = &blendAttach;

    // Push constant: 4×4 MVP matrix (64 bytes)
    VkPushConstantRange pcRange{};
    pcRange.stageFlags = VK_SHADER_STAGE_VERTEX_BIT;
    pcRange.offset     = 0;
    pcRange.size       = 64;

    VkPipelineLayoutCreateInfo plci{};
    plci.sType                  = VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;
    plci.pushConstantRangeCount = 1;
    plci.pPushConstantRanges    = &pcRange;
    VK_CHECK(vkCreatePipelineLayout(m.device, &plci, nullptr, &m.pipelineLayout));

    VkGraphicsPipelineCreateInfo gpci{};
    gpci.sType               = VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;
    gpci.stageCount          = 2;
    gpci.pStages             = stages;
    gpci.pVertexInputState   = &vis;
    gpci.pInputAssemblyState = &ias;
    gpci.pViewportState      = &vs;
    gpci.pRasterizationState = &rs;
    gpci.pMultisampleState   = &ms;
    gpci.pColorBlendState    = &blend;
    gpci.layout              = m.pipelineLayout;
    gpci.renderPass          = m.renderPass;
    gpci.subpass             = 0;
    VK_CHECK(vkCreateGraphicsPipelines(m.device, VK_NULL_HANDLE, 1, &gpci, nullptr, &m.pipeline));

    vkDestroyShaderModule(m.device, vertMod, nullptr);
    vkDestroyShaderModule(m.device, fragMod, nullptr);
    std::printf("[VulkanContext] Graphics pipeline created\n");
    return true;
}

static bool CreateCommandInfrastructure(VulkanContext::Impl& m) {
    VkCommandPoolCreateInfo cpci{};
    cpci.sType            = VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;
    cpci.queueFamilyIndex = m.graphicsFamily;
    cpci.flags            = VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
    VK_CHECK(vkCreateCommandPool(m.device, &cpci, nullptr, &m.commandPool));

    VkCommandBufferAllocateInfo cbai{};
    cbai.sType              = VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;
    cbai.commandPool        = m.commandPool;
    cbai.level              = VK_COMMAND_BUFFER_LEVEL_PRIMARY;
    cbai.commandBufferCount = MAX_FRAMES_IN_FLIGHT;
    VK_CHECK(vkAllocateCommandBuffers(m.device, &cbai, m.cmdBufs.data()));

    VkSemaphoreCreateInfo semi{};
    semi.sType = VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO;
    VkFenceCreateInfo fci{VK_STRUCTURE_TYPE_FENCE_CREATE_INFO, nullptr, VK_FENCE_CREATE_SIGNALED_BIT};

    for (uint32_t i = 0; i < MAX_FRAMES_IN_FLIGHT; ++i) {
        VK_CHECK(vkCreateSemaphore(m.device, &semi, nullptr, &m.imgAvail[i]));
        VK_CHECK(vkCreateSemaphore(m.device, &semi, nullptr, &m.renderDone[i]));
        VK_CHECK(vkCreateFence(m.device, &fci, nullptr, &m.inFlight[i]));
    }
    return true;
}

// ─── VulkanContext public API ─────────────────────────────────────────────────

VulkanContext::VulkanContext()  : m_impl(std::make_unique<Impl>()) {}
VulkanContext::~VulkanContext() { Shutdown(); }

bool VulkanContext::Initialize(void* windowHandle, uint32_t width, uint32_t height) {
    m_width  = width;
    m_height = height;

    auto& m = *m_impl;
    if (!CreateInstance(m))                              return false;
    if (!CreateSurface(m, windowHandle, width, height))  return false;
    if (!PickPhysicalDevice(m))                          return false;
    if (!CreateDevice(m))                                return false;
    if (!CreateSwapchain(m, width, height))              return false;
    if (!CreateRenderPass(m))                            return false;
    if (!CreateFramebuffers(m))                          return false;
    if (!CreateCommandInfrastructure(m))                 return false;
    if (!CreatePipeline(m))                              return false;

    m_initialized = true;
    m_gpuActive   = true;
    std::printf("[VulkanContext] GPU backend ready (%ux%u, %s)\n",
                width, height, m.headless ? "headless" : "windowed");
    return true;
}

void VulkanContext::Shutdown() {
    if (!m_initialized) return;
    auto& m = *m_impl;

    vkDeviceWaitIdle(m.device);

    for (uint32_t i = 0; i < MAX_FRAMES_IN_FLIGHT; ++i) {
        if (m.imgAvail[i])   vkDestroySemaphore(m.device, m.imgAvail[i],   nullptr);
        if (m.renderDone[i]) vkDestroySemaphore(m.device, m.renderDone[i], nullptr);
        if (m.inFlight[i])   vkDestroyFence(m.device, m.inFlight[i], nullptr);
    }
    if (m.commandPool) vkDestroyCommandPool(m.device, m.commandPool, nullptr);
    if (m.pipeline)       vkDestroyPipeline(m.device, m.pipeline, nullptr);
    if (m.pipelineLayout) vkDestroyPipelineLayout(m.device, m.pipelineLayout, nullptr);
    for (auto fb : m.framebuffers) vkDestroyFramebuffer(m.device, fb, nullptr);
    if (m.renderPass) vkDestroyRenderPass(m.device, m.renderPass, nullptr);
    for (auto iv : m.swapImageViews) vkDestroyImageView(m.device, iv, nullptr);
    if (m.swapchain) vkDestroySwapchainKHR(m.device, m.swapchain, nullptr);
    if (m.surface)   vkDestroySurfaceKHR(m.instance, m.surface, nullptr);
    if (m.device)    vkDestroyDevice(m.device, nullptr);
    if (m.debugMessenger) {
        auto fn = (PFN_vkDestroyDebugUtilsMessengerEXT)
            vkGetInstanceProcAddr(m.instance, "vkDestroyDebugUtilsMessengerEXT");
        if (fn) fn(m.instance, m.debugMessenger, nullptr);
    }
    if (m.instance) vkDestroyInstance(m.instance, nullptr);

    m_initialized = false;
    m_gpuActive   = false;
    std::printf("[VulkanContext] Shutdown complete\n");
}

void VulkanContext::BeginFrame() {
    if (!m_initialized || !m_gpuActive) return;
    auto& m = *m_impl;

    vkWaitForFences(m.device, 1, &m.inFlight[m.currentFrame], VK_TRUE, UINT64_MAX);
    vkResetFences(m.device,   1, &m.inFlight[m.currentFrame]);

    if (!m.headless) {
        VkResult res = vkAcquireNextImageKHR(m.device, m.swapchain, UINT64_MAX,
                                             m.imgAvail[m.currentFrame],
                                             VK_NULL_HANDLE, &m.currentImage);
        if (res == VK_ERROR_OUT_OF_DATE_KHR) return;  // Will Resize next frame
    }

    vkResetCommandBuffer(m.cmdBufs[m.currentFrame], 0);
    VkCommandBufferBeginInfo bi{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
    vkBeginCommandBuffer(m.cmdBufs[m.currentFrame], &bi);

    if (!m.headless && m.renderPass) {
        VkClearValue clearColor = {{{0.05f, 0.07f, 0.12f, 1.0f}}};
        VkRenderPassBeginInfo rpbi{};
        rpbi.sType           = VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;
        rpbi.renderPass      = m.renderPass;
        rpbi.framebuffer     = m.framebuffers[m.currentImage];
        rpbi.renderArea      = {{0, 0}, m.swapExtent};
        rpbi.clearValueCount = 1;
        rpbi.pClearValues    = &clearColor;
        vkCmdBeginRenderPass(m.cmdBufs[m.currentFrame], &rpbi, VK_SUBPASS_CONTENTS_INLINE);

        if (m.pipeline) {
            vkCmdBindPipeline(m.cmdBufs[m.currentFrame], VK_PIPELINE_BIND_POINT_GRAPHICS, m.pipeline);
            // RenderScene records draw calls here via GetCurrentCommandBuffer (Phase M3)
        }
    }
}

void VulkanContext::Present() {
    if (!m_initialized || !m_gpuActive) return;
    auto& m = *m_impl;

    if (!m.headless && m.renderPass)
        vkCmdEndRenderPass(m.cmdBufs[m.currentFrame]);

    VK_CHECK_V(vkEndCommandBuffer(m.cmdBufs[m.currentFrame]));

    // Submit
    VkSemaphore waitSems[]   = {m.imgAvail[m.currentFrame]};
    VkSemaphore signalSems[] = {m.renderDone[m.currentFrame]};
    VkPipelineStageFlags waitStages[] = {VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT};

    VkSubmitInfo si{};
    si.sType                = VK_STRUCTURE_TYPE_SUBMIT_INFO;
    si.waitSemaphoreCount   = m.headless ? 0 : 1;
    si.pWaitSemaphores      = m.headless ? nullptr : waitSems;
    si.pWaitDstStageMask    = m.headless ? nullptr : waitStages;
    si.commandBufferCount   = 1;
    si.pCommandBuffers      = &m.cmdBufs[m.currentFrame];
    si.signalSemaphoreCount = m.headless ? 0 : 1;
    si.pSignalSemaphores    = m.headless ? nullptr : signalSems;
    VK_CHECK_V(vkQueueSubmit(m.graphicsQueue, 1, &si, m.inFlight[m.currentFrame]));

    if (!m.headless && m.swapchain) {
        VkPresentInfoKHR pi{};
        pi.sType              = VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;
        pi.waitSemaphoreCount = 1;
        pi.pWaitSemaphores    = signalSems;
        pi.swapchainCount     = 1;
        pi.pSwapchains        = &m.swapchain;
        pi.pImageIndices      = &m.currentImage;
        vkQueuePresentKHR(m.presentQueue, &pi);
    }

    m.currentFrame = (m.currentFrame + 1) % MAX_FRAMES_IN_FLIGHT;
}

void VulkanContext::Resize(uint32_t width, uint32_t height) {
    if (!m_initialized || !m_gpuActive) { m_width = width; m_height = height; return; }
    auto& m = *m_impl;
    vkDeviceWaitIdle(m.device);

    for (auto fb : m.framebuffers) vkDestroyFramebuffer(m.device, fb, nullptr);
    m.framebuffers.clear();
    for (auto iv : m.swapImageViews) vkDestroyImageView(m.device, iv, nullptr);
    m.swapImageViews.clear();
    if (m.swapchain) vkDestroySwapchainKHR(m.device, m.swapchain, nullptr);

    m_width = width; m_height = height;
    CreateSwapchain(m, width, height);
    CreateFramebuffers(m);
    std::printf("[VulkanContext] Swapchain recreated (%ux%u)\n", width, height);
}

// ─── Memory helper ────────────────────────────────────────────────────────────

static uint32_t FindMemoryType(VkPhysicalDevice physDev, uint32_t typeMask,
                               VkMemoryPropertyFlags props) {
    VkPhysicalDeviceMemoryProperties mp;
    vkGetPhysicalDeviceMemoryProperties(physDev, &mp);
    for (uint32_t i = 0; i < mp.memoryTypeCount; ++i)
        if ((typeMask & (1u << i)) &&
            (mp.memoryTypes[i].propertyFlags & props) == props)
            return i;
    return UINT32_MAX;
}

bool VulkanContext::AllocateHostBuffer(const void* data, size_t size, uint32_t usageFlags,
                                       uint64_t* outBuffer, uint64_t* outMemory) {
    if (!m_gpuActive || !data || size == 0) return false;
    auto& m = *m_impl;

    VkBufferCreateInfo bci{};
    bci.sType       = VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;
    bci.size        = size;
    bci.usage       = static_cast<VkBufferUsageFlags>(usageFlags);
    bci.sharingMode = VK_SHARING_MODE_EXCLUSIVE;

    VkBuffer buf = VK_NULL_HANDLE;
    if (vkCreateBuffer(m.device, &bci, nullptr, &buf) != VK_SUCCESS) return false;

    VkMemoryRequirements req;
    vkGetBufferMemoryRequirements(m.device, buf, &req);

    const uint32_t memIdx = FindMemoryType(m.physDev, req.memoryTypeBits,
        VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);
    if (memIdx == UINT32_MAX) { vkDestroyBuffer(m.device, buf, nullptr); return false; }

    VkMemoryAllocateInfo ai{};
    ai.sType           = VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;
    ai.allocationSize  = req.size;
    ai.memoryTypeIndex = memIdx;

    VkDeviceMemory mem = VK_NULL_HANDLE;
    if (vkAllocateMemory(m.device, &ai, nullptr, &mem) != VK_SUCCESS) {
        vkDestroyBuffer(m.device, buf, nullptr);
        return false;
    }

    void* mapped = nullptr;
    vkMapMemory(m.device, mem, 0, size, 0, &mapped);
    std::memcpy(mapped, data, size);
    vkUnmapMemory(m.device, mem);
    vkBindBufferMemory(m.device, buf, mem, 0);

    *outBuffer = static_cast<uint64_t>(reinterpret_cast<uintptr_t>(buf));
    *outMemory = static_cast<uint64_t>(reinterpret_cast<uintptr_t>(mem));
    return true;
}

void VulkanContext::FreeHostBuffer(uint64_t vkBuffer, uint64_t vkMemory) {
    if (!m_gpuActive) return;
    auto& m = *m_impl;
    auto buf = reinterpret_cast<VkBuffer>(static_cast<uintptr_t>(vkBuffer));
    auto mem = reinterpret_cast<VkDeviceMemory>(static_cast<uintptr_t>(vkMemory));
    if (buf) vkDestroyBuffer(m.device, buf, nullptr);
    if (mem) vkFreeMemory(m.device, mem, nullptr);
}

void* VulkanContext::GetCurrentCommandBuffer() const {
    if (!m_gpuActive) return nullptr;
    return static_cast<void*>(m_impl->cmdBufs[m_impl->currentFrame]);
}

void* VulkanContext::GetPipelineLayout() const {
    if (!m_gpuActive) return nullptr;
    return static_cast<void*>(m_impl->pipelineLayout);
}

} // namespace pac::render

// ─── Stub path (no Vulkan SDK) ────────────────────────────────────────────────
#else

namespace pac::render {

struct VulkanContext::Impl {};

VulkanContext::VulkanContext()  : m_impl(std::make_unique<Impl>()) {}
VulkanContext::~VulkanContext() { Shutdown(); }

bool VulkanContext::Initialize(void* /*windowHandle*/, uint32_t width, uint32_t height) {
    m_width  = width;
    m_height = height;
    std::printf("[VulkanContext] Stub backend (%ux%u) — no GPU (HAVE_VULKAN not defined)\n",
                width, height);
    m_initialized = true;
    return true;
}

void VulkanContext::Shutdown() {
    if (!m_initialized) return;
    m_initialized = false;
    std::printf("[VulkanContext] Stub shutdown\n");
}

void VulkanContext::BeginFrame() {}
void VulkanContext::Present()    {}
void VulkanContext::Resize(uint32_t w, uint32_t h) { m_width = w; m_height = h; }

bool VulkanContext::AllocateHostBuffer(const void*, size_t, uint32_t,
                                       uint64_t* outBuf, uint64_t* outMem) {
    if (outBuf) *outBuf = 0;
    if (outMem) *outMem = 0;
    return false;
}

void VulkanContext::FreeHostBuffer(uint64_t, uint64_t) {}
void* VulkanContext::GetCurrentCommandBuffer() const { return nullptr; }
void* VulkanContext::GetPipelineLayout()       const { return nullptr; }

} // namespace pac::render

#endif // HAVE_VULKAN
