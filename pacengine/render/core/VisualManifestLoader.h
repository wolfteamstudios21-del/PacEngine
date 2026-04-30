#pragma once
#include <string>
#include "VisualManifest.h"

namespace pac::render {

// Loads and parses visual_manifest.json into a VisualManifest struct.
// Requires HAVE_NLOHMANN_JSON at compile time (enabled automatically when
// PACENGINE_BUILD_RENDER=ON pulls in nlohmann/json via FetchContent).
class VisualManifestLoader {
public:
    // Load from a file on disk. Returns false and prints to stderr on failure.
    static bool Load(const std::string& filePath, VisualManifest& out);

    // Parse from a raw JSON string (useful for unit tests or in-memory blobs).
    static bool Parse(const std::string& jsonStr, VisualManifest& out);
};

} // namespace pac::render
