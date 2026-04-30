#pragma once
// C++ representation of world.pacdata.json as produced by @workspace/pacengine-export.
// Parallels the TypeScript PacEngineExportOptions shape — kept in sync manually.

#include <array>
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>
#include "render_types.h"

namespace pac::render {

// ─── Per-entity component structs ────────────────────────────────────────────

struct PacTransformComponent {
    PacVec3              position  = {};
    std::array<float, 4> rotation  = {0.f, 0.f, 0.f, 1.f}; // quaternion xyzw
    PacVec3              scale     = {1.f, 1.f, 1.f};
};

struct PacConflictComponent {
    std::string type;      // e.g. "skirmish", "siege"
    int         severity = 1;
};

// One entity in the simulation world.
struct PacEntity {
    // id is always numeric at runtime (strings are normalised by the parser)
    uint64_t id = 0;
    std::string name;
    std::string faction;
    std::string zone;
    std::string type;  // e.g. "npc_agent"

    std::unordered_map<std::string, std::string> tags;

    PacTransformComponent transform;
    PacConflictComponent  conflict;
};

// ─── Behaviour graph (Phase M3) ───────────────────────────────────────────────

struct BehaviorGraphNode {
    std::string id;
    std::string type;
    std::unordered_map<std::string, std::string> params;
};

struct BehaviorGraph {
    std::string id;
    std::vector<BehaviorGraphNode> nodes;
};

// ─── Conflict-sim block ───────────────────────────────────────────────────────

struct ConflictSimData {
    bool        enabled = false;
    std::string version;
    // Raw JSON preserved for Phase M3 interpretation — not fully parsed here.
    // TODO: expand to typed Zone/Faction/Conflict structs.
};

// ─── Shard descriptor ────────────────────────────────────────────────────────

struct ShardData {
    std::string id;
    std::string type;
    int         priority = 0;
};

// ─── GM logic ────────────────────────────────────────────────────────────────

struct GmLogicData {
    std::string pacing        = "medium"; // slow | medium | fast
    std::string scenario_type = "skirmish";
};

// ─── Top-level world ─────────────────────────────────────────────────────────

struct PacDataWorld {
    // Header
    std::string pacdata_version; // e.g. "1.1.0"
    std::string paccore_version; // e.g. "3.0.0"

    // world block
    std::string name;
    uint64_t    seed        = 0;
    std::string description;

    std::vector<PacEntity>     entities;
    std::vector<BehaviorGraph> behaviorGraphs;
    std::vector<ShardData>     shards;
    ConflictSimData            conflictSim;
    GmLogicData                gmLogic;
};

} // namespace pac::render
