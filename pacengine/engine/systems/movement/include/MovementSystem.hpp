#pragma once

#include "ISystem.hpp"

#include <cstdint>
#include <string>

namespace pac {

class World;

// Deterministic movement: every entity carrying a PositionComponent
// receives a small, tick-and-id-derived delta. The delta function is
// pure — same (entity_index, tick) ⇒ same delta on every platform — so
// two runs of the same PacData produce byte-identical position
// trajectories.
//
// MovementSystem is the first system that *mutates* world state through
// the trace v2 path. It is the engine-side proof that the trace records
// real, evolving simulation data (not just markers).
class MovementSystem final : public ISystem {
public:
    MovementSystem() = default;

    std::string name() const override { return "movement"; }
    void        tick(World& world, std::uint64_t tick) override;
};

} // namespace pac
