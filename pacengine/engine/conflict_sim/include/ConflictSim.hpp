#pragma once

#include "PacData.hpp"

#include <cstdint>

namespace pac {

class World;

// Native ConflictSim module. It is part of the engine — not a plugin —
// but it is *driven by data* through ConflictSimConfig in PacData.
class ConflictSim {
public:
    ConflictSim(World& world, const ConflictSimConfig& cfg);

    bool enabled() const noexcept { return enabled_; }

    // Advance the conflict simulation by one PacRuntime tick.
    void tick(World& world, std::uint64_t tick);

    const ConflictSimConfig& config() const noexcept { return config_; }

private:
    bool              enabled_;
    ConflictSimConfig config_;
};

} // namespace pac
