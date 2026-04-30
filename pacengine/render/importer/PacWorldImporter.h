#pragma once
// PacWorldImporter — single entry point for loading a PacAi export folder.
//
// Orchestrates:
//   1. Asset-directory preparation + placeholder stubs
//   2. VisualManifestLoader  →  PacRenderer::ApplyVisualManifest()
//   3. PacDataLoader         →  PacSimulation::LoadWorld() (Phase M3 stub)
//
// PacRenderer stays purely visual; simulation ingestion is its own concern.

#include <string>
#include <memory>
#include "../core/PacDataWorld.h"
#include "../core/VisualManifest.h"

namespace pac::render {

class PacRenderer;

// PacSimulation is defined in the runtime lib (Phase M3).  Forward-declared
// here so the importer can hold a pointer; calls are stubbed until M3 lands.
class PacSimulation;

class PacWorldImporter {
public:
    // Both pointers are optional — pass nullptr to skip that side.
    explicit PacWorldImporter(PacRenderer* renderer,
                              PacSimulation* simulation = nullptr);

    // Main entry: import an export folder produced by @workspace/pacengine-export.
    // Returns true if at least one of (visual, pacdata) was loaded successfully.
    bool Import(const std::string& exportFolderPath);

    // Individual loaders — useful in unit tests.
    static bool LoadPacData(const std::string& pacdataPath, PacDataWorld& out);
    static bool LoadVisualManifest(const std::string& manifestPath, VisualManifest& out);

private:
    PacRenderer*   m_renderer   = nullptr;
    PacSimulation* m_simulation = nullptr;

    // Ensures assets/models and assets/models/terrain exist.
    static bool CreateAssetDirectories(const std::string& exportFolderPath);

    // Seeds the assets directory with empty placeholder stubs so the scene is
    // never completely empty while real glTF files are being authored.
    static bool CreatePlaceholderAssets(const std::string& exportFolderPath);

    // (Phase M3) Bridge: apply visual hints back to simulation entities.
    void ApplyVisualToSimulation(const VisualManifest& manifest,
                                 const PacDataWorld& world);
};

} // namespace pac::render
