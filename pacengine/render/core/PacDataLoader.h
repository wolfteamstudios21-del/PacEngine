#pragma once
#include <string>
#include "PacDataWorld.h"

namespace pac::render {

// Loads world.pacdata.json (as produced by @workspace/pacengine-export)
// into a PacDataWorld struct for use by PacRenderer::UpdateSimulationState().
//
// Supports both the classic format (world.entities) and the v7 flat format
// (top-level entities array) — matching the TS-side pacdata-parser.ts logic.
class PacDataLoader {
public:
    // Load from a file path.  Returns false and prints to stderr on failure.
    static bool Load(const std::string& filePath, PacDataWorld& out);

    // Parse from a raw JSON string (useful for unit tests).
    static bool Parse(const std::string& jsonStr, PacDataWorld& out);
};

} // namespace pac::render
