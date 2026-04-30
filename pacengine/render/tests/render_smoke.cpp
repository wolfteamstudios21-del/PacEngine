// render_smoke.cpp — M2.5.1 smoke test for libpacengine_render
//
// Tests that pass on Replit (stub Vulkan backend, real fastgltf):
//   1. PacRenderer lifecycle: Initialize → BeginFrame → Render → EndFrame → Shutdown
//   2. GltfLoader::LoadMemory on a minimal embedded glTF JSON
//   3. PacWorldImporter::Import on a temp folder with a mock manifest
//
// Tests that require HAVE_VULKAN (GPU build, not run on Replit):
//   4. VulkanContext GPU initialisation (skipped when !HAVE_VULKAN)

#include <cassert>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <memory>
#include <string>

#include "core/PacRenderer.h"
#include "core/RenderScene.h"
#include "core/RenderProxy.h"
#include "core/Mesh.h"
#include "assets/GltfLoader.h"
#include "importer/PacWorldImporter.h"

namespace fs = std::filesystem;
using namespace pac::render;

// ─── Helpers ─────────────────────────────────────────────────────────────────

static int g_pass = 0;
static int g_fail = 0;

#define EXPECT(cond)                                                    \
    do {                                                                \
        if (cond) {                                                     \
            std::printf("  PASS: %s\n", #cond);                        \
            ++g_pass;                                                   \
        } else {                                                        \
            std::fprintf(stderr, "  FAIL: %s  (%s:%d)\n",              \
                         #cond, __FILE__, __LINE__);                    \
            ++g_fail;                                                   \
        }                                                               \
    } while (0)

// Minimal glTF 2.0 — one triangle primitive.
// Binary buffer (78 bytes, all zeros):
//   [0..35]  3×VEC3 FLOAT positions — (0,0,0) × 3  (count still drives vertex creation)
//   [36..71] 3×VEC3 FLOAT normals   — (0,0,0) × 3
//   [72..77] 3×UNSIGNED_SHORT indices — 0, 0, 0 (GltfLoader up-casts to uint32_t)
// 78 bytes → 26 base64 groups → exactly 104 'A' characters, no padding needed.
static constexpr const char kMinimalGltf[] = R"({
  "asset": {"version": "2.0"},
  "scene": 0,
  "scenes": [{"nodes": [0]}],
  "nodes": [{"mesh": 0}],
  "meshes": [{
    "name": "triangle",
    "primitives": [{
      "attributes": {"POSITION": 0, "NORMAL": 1},
      "indices": 2
    }]
  }],
  "accessors": [
    {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3",
     "min": [-1,-1,0], "max": [1,1,0]},
    {"bufferView": 1, "componentType": 5126, "count": 3, "type": "VEC3"},
    {"bufferView": 2, "componentType": 5123, "count": 3, "type": "SCALAR"}
  ],
  "bufferViews": [
    {"buffer": 0, "byteOffset":  0, "byteLength": 36},
    {"buffer": 0, "byteOffset": 36, "byteLength": 36},
    {"buffer": 0, "byteOffset": 72, "byteLength":  6}
  ],
  "buffers": [{"byteLength": 78, "uri": "data:application/octet-stream;base64,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}]
})";

// Minimal valid glTF 2.0 (for folder-based import tests — no geometry needed)
static constexpr const char kFolderManifest[] = R"({
  "version": "1.0.0",
  "environment": {
    "sky_type": "physical",
    "sun_direction": [0.5, 0.8, 0.3],
    "sun_color": [1.0, 0.95, 0.9],
    "sun_intensity": 1.5,
    "ambient_intensity": 0.2,
    "fog_enabled": false,
    "fog_density": 0.02,
    "fog_color": [0.7, 0.8, 0.9]
  },
  "global_illumination": {
    "gi_type": "probe_grid",
    "probe_density": "medium"
  },
  "post_processing": {
    "tonemap": "aces",
    "bloom_intensity": 0.3,
    "exposure": 1.0
  },
  "camera_default": {
    "position": [0, 5, -10],
    "target":   [0, 0,   0],
    "fov": 60
  },
  "lights": [],
  "entities": [],
  "static_meshes": []
})";

// ─── Test suites ──────────────────────────────────────────────────────────────

static void TestRendererLifecycle() {
    std::printf("\n── Test 1: PacRenderer lifecycle ────────────────────────────\n");

    pac::render::PacRenderer renderer;

    // Initialize with nullptr window handle → stub backend
    const bool ok = renderer.Initialize(nullptr, 1280, 720);
    EXPECT(ok);
    EXPECT(renderer.IsUsing3D());

    renderer.SetViewportMode(false);
    EXPECT(!renderer.IsUsing3D());
    renderer.SetViewportMode(true);

    renderer.BeginFrame();
    renderer.Render();
    renderer.EndFrame();

    renderer.Resize(1920, 1080);

    renderer.Shutdown();
    std::printf("  Lifecycle: %s\n", ok ? "OK" : "FAILED");
}

static void TestGltfLoader() {
    std::printf("\n── Test 2: GltfLoader (fastgltf in-memory) ──────────────────\n");

    pac::render::GltfLoader loader;

#if defined(HAVE_FASTGLTF)
    GltfLoadResult r = loader.LoadMemory(
        kMinimalGltf, std::strlen(kMinimalGltf), ".");

    std::printf("  success=%d  meshes=%zu  error=%s\n",
                r.success,
                r.meshes.size(),
                r.error.empty() ? "(none)" : r.error.c_str());

    // Hard assertions — must get a mesh with real vertex and index data.
    EXPECT(r.success);
    EXPECT(!r.meshes.empty());
    if (!r.meshes.empty() && r.meshes[0]) {
        EXPECT(!r.meshes[0]->primitives.empty());
        if (!r.meshes[0]->primitives.empty()) {
            const auto& prim = r.meshes[0]->primitives[0];
            std::printf("  vertices=%zu  indices=%zu\n",
                        prim.vertices.size(), prim.indices.size());
            EXPECT(prim.vertices.size() == 3);  // accessor.count=3
            EXPECT(prim.indices.size()  == 3);  // accessor.count=3
        }
    }
#else
    auto r = loader.LoadMemory(kMinimalGltf, std::strlen(kMinimalGltf), ".");
    EXPECT(!r.success);
    EXPECT(!r.error.empty());
    std::printf("  fastgltf not compiled in — stub path confirmed\n");
#endif
}

static void TestGltfLoaderFile() {
    std::printf("\n── Test 3: GltfLoader file I/O ──────────────────────────────\n");

    const fs::path tmpDir = fs::temp_directory_path() / "pacengine_smoke";
    fs::create_directories(tmpDir);
    const fs::path gltfPath = tmpDir / "triangle.gltf";

    {
        std::ofstream f(gltfPath);
        EXPECT(f.good());
        f << kMinimalGltf;
    }

    pac::render::GltfLoader loader;
    auto r = loader.LoadFile(gltfPath.string());

#if defined(HAVE_FASTGLTF)
    std::printf("  success=%d  meshes=%zu  error=%s\n",
                r.success, r.meshes.size(),
                r.error.empty() ? "(none)" : r.error.c_str());

    EXPECT(r.success);
    EXPECT(!r.meshes.empty());
    if (!r.meshes.empty() && r.meshes[0]) {
        EXPECT(!r.meshes[0]->primitives.empty());
        if (!r.meshes[0]->primitives.empty()) {
            const auto& prim = r.meshes[0]->primitives[0];
            std::printf("  file: vertices=%zu  indices=%zu\n",
                        prim.vertices.size(), prim.indices.size());
            EXPECT(prim.vertices.size() == 3);
            EXPECT(prim.indices.size()  == 3);
        }
    }
#else
    EXPECT(!r.success);
    std::printf("  Stub path confirmed\n");
#endif

    fs::remove_all(tmpDir);
}

static void TestWorldImporter() {
    std::printf("\n── Test 4: PacWorldImporter ─────────────────────────────────\n");

    const fs::path tmpDir = fs::temp_directory_path() / "pacengine_import_smoke";
    fs::create_directories(tmpDir);

    // Write a minimal visual_manifest.json
    {
        std::ofstream f(tmpDir / "visual_manifest.json");
        EXPECT(f.good());
        f << kFolderManifest;
    }

    pac::render::PacRenderer renderer;
    const bool initOk = renderer.Initialize(nullptr, 800, 600);
    EXPECT(initOk);

    pac::render::PacWorldImporter importer(&renderer);
    const bool importOk = importer.Import(tmpDir.string());
    EXPECT(importOk);

    renderer.Shutdown();
    fs::remove_all(tmpDir);
}

// ─── Test 5: RenderScene draw recording ───────────────────────────────────────
// Validates that RecordDrawCalls iterates proxies and handles the
// vertexBufferHandle / indexBufferHandle guard correctly.
// Test 5 — two sub-paths:
//   A) null commandBuffer → RecordDrawCalls returns early without touching Vulkan.
//      Safe in both stub and HAVE_VULKAN builds; verifies the guard contract and
//      that mesh/proxy data is not corrupted by the call.
//   B) non-null sentinel pointer to exercise the stub's proxy-iteration loop.
//      Guarded by !HAVE_VULKAN because the pointer is NOT a valid VkCommandBuffer
//      and must never be cast to one in a real Vulkan build.
static void TestRecordDrawCalls() {
    std::printf("\n── Test 5: RenderScene::RecordDrawCalls ──────────────────────\n");

    const float identity[16] = {1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1};

    // ── 5A: null commandBuffer — safe in every build ──
    {
        auto mesh = std::make_shared<pac::render::Mesh>();
        mesh->name = "smoke_tri_null";
        pac::render::MeshPrimitive prim;
        prim.vertices.resize(3);
        prim.indices = {0, 1, 2};
        prim.vertexBufferHandle = 0xBEEFull;
        prim.indexBufferHandle  = 0xFACEull;
        mesh->primitives.push_back(std::move(prim));

        pac::render::RenderScene scene;
        auto* proxy = scene.CreateProxy(42u);
        EXPECT(proxy != nullptr);
        if (!proxy) return;
        proxy->visible = true;
        proxy->mesh = mesh.get();
        scene.RegisterMesh(mesh);

        // nullptr commandBuffer triggers the early-return guard; no Vulkan call.
        scene.RecordDrawCalls(nullptr, nullptr, identity);
        // Verify RecordDrawCalls did not corrupt mesh or proxy state.
        EXPECT(proxy->mesh != nullptr);
        EXPECT(proxy->mesh->primitives.size() == 1);
        EXPECT(proxy->mesh->primitives[0].vertexBufferHandle == 0xBEEFull);
    }

#if !defined(HAVE_VULKAN)
    // ── 5B: non-null sentinel — stub build only ──
    // In stub mode the HAVE_VULKAN branch is not compiled, so the sentinel
    // pointer is never cast to VkCommandBuffer; this exercises the diagnostic loop.
    {
        auto mesh = std::make_shared<pac::render::Mesh>();
        mesh->name = "smoke_tri_stub";
        pac::render::MeshPrimitive prim;
        prim.vertices.resize(3);
        prim.indices = {0, 1, 2};
        prim.vertexBufferHandle = 0xDEADBEEFull;
        prim.indexBufferHandle  = 0xCAFEBABEull;
        mesh->primitives.push_back(std::move(prim));

        pac::render::RenderScene scene;
        auto* proxy = scene.CreateProxy(43u);
        EXPECT(proxy != nullptr);
        if (!proxy) return;
        proxy->visible = true;
        proxy->mesh = mesh.get();
        scene.RegisterMesh(mesh);

        int sentinel = 0;
        scene.RecordDrawCalls(&sentinel, nullptr, identity);
        // RecordDrawCalls must not modify mesh data (read-only contract).
        EXPECT(proxy->mesh->primitives[0].vertexBufferHandle == 0xDEADBEEFull);
        EXPECT(proxy->mesh->primitives[0].indexBufferHandle  == 0xCAFEBABEull);
    }

#if defined(HAVE_FASTGLTF)
    // ── 5C: real parsed mesh + stub sentinel ──
    {
        pac::render::GltfLoader loader;
        auto loaded = loader.LoadMemory(kMinimalGltf, std::strlen(kMinimalGltf), ".");
        EXPECT(loaded.success);
        if (loaded.success && !loaded.meshes.empty() &&
            !loaded.meshes[0]->primitives.empty()) {
            auto& prim0 = loaded.meshes[0]->primitives[0];
            prim0.vertexBufferHandle = 0xBEEFull;
            prim0.indexBufferHandle  = 0xFACEull;

            pac::render::RenderScene scene2;
            auto* p2 = scene2.CreateProxy(99u);
            EXPECT(p2 != nullptr);
            if (p2) {
                p2->visible = true;
                p2->mesh = loaded.meshes[0].get();
                scene2.RegisterMesh(loaded.meshes[0]);
                int sentinel = 0;
                scene2.RecordDrawCalls(&sentinel, nullptr, identity);
                EXPECT(prim0.vertexBufferHandle == 0xBEEFull); // unchanged
                std::printf("  RecordDrawCalls with real parsed mesh: OK\n");
            }
        }
    }
#endif // HAVE_FASTGLTF
#endif // !HAVE_VULKAN

    std::printf("  RecordDrawCalls: OK\n");
}

#if defined(HAVE_VULKAN)
static void TestVulkanGpu() {
    std::printf("\n── Test 6: VulkanContext GPU (requires Vulkan SDK) ──────────\n");
    pac::render::VulkanContext ctx;
    // Pass nullptr window handle → headless GPU path
    const bool ok = ctx.Initialize(nullptr, 800, 600);
    EXPECT(ok);
    EXPECT(ctx.IsGpuActive());
    if (ok) {
        ctx.BeginFrame();
        ctx.Present();
        ctx.Shutdown();
    }
}
#endif

// ─── Entry point ─────────────────────────────────────────────────────────────

int main() {
    std::printf("=== PacEngine Render Smoke Test (M2.5.1) ===\n");
#if defined(HAVE_VULKAN)
    std::printf("Backend: Vulkan GPU\n");
#else
    std::printf("Backend: Stub (no Vulkan SDK)\n");
#endif
#if defined(HAVE_FASTGLTF)
    std::printf("glTF:    fastgltf\n");
#else
    std::printf("glTF:    stub\n");
#endif

    TestRendererLifecycle();
    TestGltfLoader();
    TestGltfLoaderFile();
    TestWorldImporter();
    TestRecordDrawCalls();
#if defined(HAVE_VULKAN)
    TestVulkanGpu();
#endif

    std::printf("\n=== Results: %d passed, %d failed ===\n", g_pass, g_fail);
    return g_fail == 0 ? 0 : 1;
}
