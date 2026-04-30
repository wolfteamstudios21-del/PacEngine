#include "TextureManager.h"
#include <cstdio>

namespace pac::render {

TextureManager::TextureManager()  = default;
TextureManager::~TextureManager() = default;

Texture* TextureManager::Load(const std::string& path) {
    auto it = m_cache.find(path);
    if (it != m_cache.end()) return it->second.get();

    std::printf("[TextureManager] Load (stub): %s\n", path.c_str());
    auto tex  = std::make_unique<Texture>();
    tex->path = path;
    auto* raw = tex.get();
    m_cache[path] = std::move(tex);
    return raw;
}

Texture* TextureManager::LoadHdr(const std::string& path) {
    auto it = m_cache.find(path);
    if (it != m_cache.end()) return it->second.get();

    std::printf("[TextureManager] LoadHdr (stub): %s\n", path.c_str());
    auto tex  = std::make_unique<Texture>();
    tex->path = path;
    tex->hdr  = true;
    auto* raw = tex.get();
    m_cache[path] = std::move(tex);
    return raw;
}

void TextureManager::Evict(const std::string& path) {
    m_cache.erase(path);
}

void TextureManager::EvictAll() {
    m_cache.clear();
}

} // namespace pac::render
