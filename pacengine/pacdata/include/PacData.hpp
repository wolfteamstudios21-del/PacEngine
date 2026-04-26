#pragma once

#include <cstdint>
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

struct EntityDef {
    std::string id;
    std::string type;   // optional, e.g. "agent". Empty == unspecified.
    // later: component bag, archetype reference
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
