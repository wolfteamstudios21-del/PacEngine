#include "GltfLoader.h"
#include "../core/Mesh.h"
#include "../core/Material.h"

#include <cstdio>
#include <filesystem>

#if defined(HAVE_FASTGLTF)
// fastgltf v0.7.1 headers (core.hpp replaced the old parser.hpp)
#include <fastgltf/core.hpp>
#include <fastgltf/types.hpp>
#include <fastgltf/tools.hpp>

// ─── POD math types with fastgltf ElementTraits (no glm needed) ──────────────
// Must live outside the pac::render namespace so the fastgltf namespace
// specialisation below resolves correctly.

struct FgVec2 { float x, y; };
struct FgVec3 { float x, y, z; };
struct FgVec4 { float x, y, z, w; };

namespace fastgltf {
template<> struct ElementTraits<FgVec2>
    : ElementTraitsBase<FgVec2, AccessorType::Vec2, float> {};
template<> struct ElementTraits<FgVec3>
    : ElementTraitsBase<FgVec3, AccessorType::Vec3, float> {};
template<> struct ElementTraits<FgVec4>
    : ElementTraitsBase<FgVec4, AccessorType::Vec4, float> {};
} // namespace fastgltf
#endif

namespace pac::render {
namespace fs = std::filesystem;

#if defined(HAVE_FASTGLTF)

// ─── Helpers ─────────────────────────────────────────────────────────────────

static const char* FgErr(fastgltf::Error e) {
    return fastgltf::getErrorMessage(e).data();
}

// ─── Material parsing ─────────────────────────────────────────────────────────

static std::shared_ptr<Material> ParseMaterial(const fastgltf::Asset& asset,
                                               std::size_t index) {
    auto mat = std::make_shared<Material>();
    if (index >= asset.materials.size()) return mat;

    const auto& src = asset.materials[index];
    mat->name = src.name;

    const auto& pbr = src.pbrData;
    // baseColorFactor is std::array<float,4> in fastgltf v0.7.x
    mat->properties.baseColorFactor.r = pbr.baseColorFactor[0];
    mat->properties.baseColorFactor.g = pbr.baseColorFactor[1];
    mat->properties.baseColorFactor.b = pbr.baseColorFactor[2];
    mat->properties.baseColorFactor.a = pbr.baseColorFactor[3];
    mat->properties.metallicFactor    = pbr.metallicFactor;
    mat->properties.roughnessFactor   = pbr.roughnessFactor;
    mat->properties.doubleSided       = src.doubleSided;
    mat->properties.alphaBlend        = (src.alphaMode == fastgltf::AlphaMode::Blend);
    return mat;
}

// ─── Primitive parsing ────────────────────────────────────────────────────────

static MeshPrimitive ParsePrimitive(const fastgltf::Asset& asset,
                                    const fastgltf::Primitive& prim) {
    MeshPrimitive mp;
    mp.materialIndex = prim.materialIndex.has_value()
        ? static_cast<int>(prim.materialIndex.value()) : 0;

    auto posIt = prim.findAttribute("POSITION");
    if (posIt == prim.attributes.end()) return mp;

    const auto& posAcc = asset.accessors[posIt->second];
    mp.vertices.resize(posAcc.count);

    fastgltf::iterateAccessorWithIndex<FgVec3>(
        asset, posAcc,
        [&](FgVec3 v, std::size_t i) {
            mp.vertices[i].position = {v.x, v.y, v.z};
        });

    auto normIt = prim.findAttribute("NORMAL");
    if (normIt != prim.attributes.end()) {
        fastgltf::iterateAccessorWithIndex<FgVec3>(
            asset, asset.accessors[normIt->second],
            [&](FgVec3 v, std::size_t i) {
                mp.vertices[i].normal = {v.x, v.y, v.z};
            });
    }

    auto uvIt = prim.findAttribute("TEXCOORD_0");
    if (uvIt != prim.attributes.end()) {
        fastgltf::iterateAccessorWithIndex<FgVec2>(
            asset, asset.accessors[uvIt->second],
            [&](FgVec2 v, std::size_t i) {
                mp.vertices[i].uv[0] = v.x;
                mp.vertices[i].uv[1] = v.y;
            });
    }

    auto tanIt = prim.findAttribute("TANGENT");
    if (tanIt != prim.attributes.end()) {
        fastgltf::iterateAccessorWithIndex<FgVec4>(
            asset, asset.accessors[tanIt->second],
            [&](FgVec4 v, std::size_t i) {
                mp.vertices[i].tangent[0] = v.x;
                mp.vertices[i].tangent[1] = v.y;
                mp.vertices[i].tangent[2] = v.z;
                mp.vertices[i].tangent[3] = v.w;
            });
    }

    if (prim.indicesAccessor.has_value()) {
        const auto& idxAcc = asset.accessors[prim.indicesAccessor.value()];
        mp.indices.resize(idxAcc.count);
        fastgltf::copyFromAccessor<uint32_t>(asset, idxAcc, mp.indices.data());
    } else {
        mp.indices.resize(mp.vertices.size());
        for (uint32_t i = 0; i < static_cast<uint32_t>(mp.vertices.size()); ++i)
            mp.indices[i] = i;
    }
    return mp;
}

// ─── Asset → GltfLoadResult ──────────────────────────────────────────────────

static GltfLoadResult ParseAsset(fastgltf::Asset& asset) {
    GltfLoadResult result;

    std::vector<std::shared_ptr<Material>> materials;
    materials.reserve(asset.materials.size());
    for (std::size_t i = 0; i < asset.materials.size(); ++i)
        materials.push_back(ParseMaterial(asset, i));
    result.materials = materials;

    result.meshes.reserve(asset.meshes.size());
    for (auto& fgMesh : asset.meshes) {
        auto mesh  = std::make_shared<Mesh>();
        mesh->name = fgMesh.name;
        mesh->primitives.reserve(fgMesh.primitives.size());
        for (auto& prim : fgMesh.primitives) {
            MeshPrimitive mp = ParsePrimitive(asset, prim);
            if (!mp.vertices.empty())
                mesh->primitives.push_back(std::move(mp));
        }
        if (!mesh->IsEmpty())
            result.meshes.push_back(std::move(mesh));
    }

    result.success = !result.meshes.empty();
    if (!result.success)
        result.error = "No renderable primitives found in glTF asset";
    return result;
}

// ─── Parser options (v0.7.1 compatible) ──────────────────────────────────────

static constexpr fastgltf::Options kOptions =
    fastgltf::Options::LoadExternalBuffers |
    fastgltf::Options::GenerateMeshIndices;

#endif // HAVE_FASTGLTF

// ─── Impl ─────────────────────────────────────────────────────────────────────

struct GltfLoader::Impl {
#if defined(HAVE_FASTGLTF)
    fastgltf::Parser parser;
#endif
};

GltfLoader::GltfLoader()  : m_impl(std::make_unique<Impl>()) {}
GltfLoader::~GltfLoader() = default;

// ─── Public API ───────────────────────────────────────────────────────────────

GltfLoadResult GltfLoader::LoadFile(const std::string& filePath) {
#if defined(HAVE_FASTGLTF)
    GltfLoadResult result;
    const fs::path path(filePath);

    // v0.7.1 API: GltfDataBuffer::loadFromFile (not FromPath)
    fastgltf::GltfDataBuffer buf;
    if (!buf.loadFromFile(path)) {
        result.error = std::string("Cannot read '") + filePath + "'";
        std::fprintf(stderr, "[GltfLoader] %s\n", result.error.c_str());
        return result;
    }

    // Parser::loadGltf auto-detects JSON vs binary in v0.7.x
    auto asset = m_impl->parser.loadGltf(&buf, path.parent_path(), kOptions);
    if (asset.error() != fastgltf::Error::None) {
        result.error = std::string("Parse error: ") + FgErr(asset.error());
        std::fprintf(stderr, "[GltfLoader] %s — %s\n", filePath.c_str(), result.error.c_str());
        return result;
    }

    result = ParseAsset(asset.get());
    if (result.success)
        std::printf("[GltfLoader] Loaded %s — meshes: %zu  materials: %zu\n",
                    filePath.c_str(), result.meshes.size(), result.materials.size());
    return result;
#else
    std::fprintf(stderr, "[GltfLoader] fastgltf not compiled in "
                         "(rebuild with PACENGINE_BUILD_RENDER=ON)\n");
    GltfLoadResult r;
    r.error = "GltfLoader unavailable — rebuild with PACENGINE_BUILD_RENDER=ON";
    return r;
#endif
}

GltfLoadResult GltfLoader::LoadMemory(const void* data, size_t size, const std::string& hint) {
#if defined(HAVE_FASTGLTF)
    GltfLoadResult result;

    fastgltf::GltfDataBuffer buf;
    if (!buf.copyBytes(reinterpret_cast<const uint8_t*>(data), size)) {
        result.error = "GltfDataBuffer::copyBytes failed";
        return result;
    }

    const fs::path dir(hint.empty() ? "." : hint);
    auto asset = m_impl->parser.loadGltf(&buf, dir, kOptions);
    if (asset.error() != fastgltf::Error::None) {
        result.error = std::string("Parse error: ") + FgErr(asset.error());
        return result;
    }

    result = ParseAsset(asset.get());
    return result;
#else
    (void)data; (void)size; (void)hint;
    GltfLoadResult r;
    r.error = "GltfLoader unavailable — rebuild with PACENGINE_BUILD_RENDER=ON";
    return r;
#endif
}

void GltfLoader::UploadToGpu(GltfLoadResult& result) {
    (void)result;
}

} // namespace pac::render
