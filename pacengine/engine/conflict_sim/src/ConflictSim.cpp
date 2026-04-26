#include "ConflictSim.hpp"

#include "World.hpp"

namespace pac {

ConflictSim::ConflictSim(World& /*world*/, const ConflictSimConfig& cfg)
    : enabled_(cfg.enabled)
    , config_(cfg) {}

void ConflictSim::tick(World& /*world*/, std::uint64_t /*tick*/) {
    if (!enabled_) {
        return;
    }
    // later: real conflict logic — resolve faction intents, apply rules,
    // mutate world state, emit conflict events into the trace.
}

} // namespace pac
