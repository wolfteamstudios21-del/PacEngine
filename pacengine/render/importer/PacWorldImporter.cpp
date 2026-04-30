#include "PacWorldImporter.h"

#include "../core/PacDataLoader.h"
#include "../core/VisualManifestLoader.h"
#include "../core/PacRenderer.h"
#include "../../simulation/PacSimulation.h"

#include <cstdio>
#include <filesystem>

namespace pac::render {
namespace fs = std::filesystem;

// ─── Construction ─────────────────────────────────────────────────────────────

PacWorldImporter::PacWorldImporter(PacRenderer* renderer, PacSimulation* simulation)
    : m_renderer(renderer), m_simulation(simulation) {}

// ─── Main import pipeline ─────────────────────────────────────────────────────

bool PacWorldImporter::Import(const std::string& exportFolderPath) {
    std::printf("[PacWorldImporter] Import: %s\n", exportFolderPath.c_str());

    if (!fs::exists(exportFolderPath)) {
        std::fprintf(stderr, "[PacWorldImporter] Export folder not found: %s\n",
                     exportFolderPath.c_str());
        return false;
    }

    // 1. Prepare folder structure and seed placeholder stubs.
    CreateAssetDirectories(exportFolderPath);
    CreatePlaceholderAssets(exportFolderPath);

    // 2. Visual side — load manifest, hand off to renderer.
    VisualManifest manifest;
    const bool hasVisual = LoadVisualManifest(
        exportFolderPath + "/visual_manifest.json", manifest);

    if (hasVisual && m_renderer) {
        m_renderer->ApplyVisualManifest(manifest, exportFolderPath);
    } else if (!hasVisual) {
        std::fprintf(stderr,
            "[PacWorldImporter] visual_manifest.json missing — visual-only fallback\n");
    }

    // 3. Simulation side — load pacdata, hand off to simulation core.
    PacDataWorld world;
    const bool hasPacData = LoadPacData(
        exportFolderPath + "/world.pacdata.json", world);

    if (hasPacData) {
        std::printf("[PacWorldImporter] PacData loaded — entities: %zu  shards: %zu\n",
                    world.entities.size(), world.shards.size());
        if (m_simulation) {
            m_simulation->LoadWorld(world);
        }
    } else {
        std::fprintf(stderr,
            "[PacWorldImporter] world.pacdata.json not found — visual-only import\n");
    }

    // 4. (Phase M3) Bridge visual metadata to simulation entities.
    if (hasVisual && hasPacData)
        ApplyVisualToSimulation(manifest, world);

    std::printf("[PacWorldImporter] Import complete — visual: %s  pacdata: %s\n",
                hasVisual  ? "OK" : "skipped",
                hasPacData ? "OK" : "skipped");

    return hasVisual || hasPacData;
}

// ─── Individual loaders ───────────────────────────────────────────────────────

bool PacWorldImporter::LoadPacData(const std::string& pacdataPath, PacDataWorld& out) {
    return PacDataLoader::Load(pacdataPath, out);
}

bool PacWorldImporter::LoadVisualManifest(const std::string& manifestPath, VisualManifest& out) {
    return VisualManifestLoader::Load(manifestPath, out);
}

// ─── Asset directory helpers ──────────────────────────────────────────────────

bool PacWorldImporter::CreateAssetDirectories(const std::string& exportFolderPath) {
    const fs::path modelsDir  = fs::path(exportFolderPath) / "assets" / "models";
    const fs::path terrainDir = modelsDir / "terrain";
    std::error_code ec;
    fs::create_directories(terrainDir, ec);
    if (ec) {
        std::fprintf(stderr, "[PacWorldImporter] Could not create asset dirs: %s\n",
                     ec.message().c_str());
        return false;
    }
    return true;
}

bool PacWorldImporter::CreatePlaceholderAssets(const std::string& exportFolderPath) {
    // Write minimal valid glTF 2.0 stubs so the scene has something to load.
    // These are identical to what PacRenderer::CreatePlaceholderAssets used to produce.
    static constexpr const char kMinimalGltf[] =
        "{\n"
        "  \"asset\":{\"version\":\"2.0\"},\n"
        "  \"scene\":0,\n"
        "  \"scenes\":[{\"nodes\":[0]}],\n"
        "  \"nodes\":[{\"name\":\"placeholder\"}]\n"
        "}\n";

    const fs::path assetsDir = fs::path(exportFolderPath) / "assets";
    const struct { const char* sub; const char* name; } stubs[] = {
        { "models",         "agent.gltf"       },
        { "models/terrain", "arena.gltf"       },
    };

    for (const auto& s : stubs) {
        const fs::path p = assetsDir / s.sub / s.name;
        if (fs::exists(p)) continue;
        if (FILE* f = std::fopen(p.string().c_str(), "w")) {
            std::fputs(kMinimalGltf, f);
            std::fclose(f);
            std::printf("[PacWorldImporter] Created placeholder: %s\n", p.string().c_str());
        }
    }
    return true;
}

// ─── Phase M3 bridge ─────────────────────────────────────────────────────────

void PacWorldImporter::ApplyVisualToSimulation(const VisualManifest& /*manifest*/,
                                               const PacDataWorld& /*world*/) {
    // TODO (Phase M3): sync visual material/visibility hints into simulation
    // entity components so the simulation can drive correct LOD budgets etc.
    std::printf("[PacWorldImporter] (stub) ApplyVisualToSimulation\n");
}

} // namespace pac::render
