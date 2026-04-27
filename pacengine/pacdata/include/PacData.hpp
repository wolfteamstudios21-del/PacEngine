#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace pac {

struct PacDataVersion {
    std::string pacdata;
    std::string paccore;
};

struct ConflictScenario {
    std::string id;
    // later: factions, objectives, rules, etc.
};

struct ConflictSimConfig {
    bool enabled = false;
    std::vector<ConflictScenario> scenarios;
};

struct ShardDef {
    std::string id;
    // later: bounds, partitioning info, replication policy
};

struct EntityPosition {
    double x = 0.0;
    double y = 0.0;
    double z = 0.0;
};

struct EntityDef {
    std::string id;
    std::string type;   // optional, e.g. "agent". Empty == unspecified.
    // Optional spawn position. When unset, the World seeds a deterministic
    // default derived from the pacdata id so the visualization is stable
    // across runs even for hand-authored PacData that omits coordinates.
    std::optional<EntityPosition> position;
    // later: full component bag, archetype reference
};

struct GMDef {
    std::string id;
    // later: rules, scripts, intents
};

struct WorldDef {
    std::string name;
    std::vector<ShardDef>  shards;
    std::vector<EntityDef> entities;
    std::vector<GMDef>     gms;
    ConflictSimConfig      conflict_sim;
};

struct PacData {
    PacDataVersion version;
    WorldDef       world;
};

// Hard validation: throws std::runtime_error on unsupported versions.
void validate_versions(const PacDataVersion& v);

} // namespace pac
