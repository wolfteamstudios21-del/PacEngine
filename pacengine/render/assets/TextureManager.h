#pragma once
#include <memory>
#include <string>
#include <unordered_map>

namespace pac::render {

class Texture;

// Central texture cache — loads from disk or memory, deduplicates by path.
class TextureManager {
public:
    TextureManager();
    ~TextureManager();

    Texture* Load(const std::string& path);
    Texture* LoadHdr(const std::string& path);       // for IBL / sky cubemaps
    void     Evict(const std::string& path);
    void     EvictAll();

private:
    std::unordered_map<std::string, std::unique_ptr<Texture>> m_cache;
};

// Opaque GPU texture handle.  Actual Vulkan objects are in the .cpp.
struct Texture {
    std::string path;
    uint32_t    width  = 0;
    uint32_t    height = 0;
    uint32_t    layers = 1;
    uint32_t    mips   = 1;
    bool        hdr    = false;
};

} // namespace pac::render
