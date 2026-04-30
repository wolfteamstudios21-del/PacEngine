#include "Material.h"
#include <cstdio>

namespace pac::render {

void Material::BuildPipeline() {
    // Phase 2.5.1 — look up or compile a Vulkan graphics pipeline from the
    // pipeline cache keyed on (shaderVariant, alphaBlend, doubleSided).
    std::printf("[Material] BuildPipeline: %s (variant=%u)\n",
                name.c_str(), shaderVariant);
}

} // namespace pac::render
