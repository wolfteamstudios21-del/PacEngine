#include "ConflictSim.hpp"

#include "Components.hpp"
#include "EventLog.hpp"
#include "Trace.hpp"
#include "World.hpp"

#include <string>

namespace pac {

ConflictSim::ConflictSim(World& /*world*/,
                         const ConflictSimConfig& cfg,
                         EventLog* events,
                         Trace*    trace)
    : enabled_(cfg.enabled)
    , config_(cfg)
    , events_(events)
    , trace_(trace) {}

void ConflictSim::tick(World& world, std::uint64_t tick) {
    if (!enabled_) {
        return;
    }

    // Deterministic agent log step: walk every entity with an
    // EntityTypeComponent of "agent" in insertion order and emit one
    // line per agent. EventLog is a no-op when not configured, so the
    // pure-trace determinism test stays byte-stable.
    //
    // Ticks are reported 1-indexed for human readers; internally the
    // runtime still counts from 0.
    const std::uint64_t human_tick = tick + 1;

    world.for_each<EntityTypeComponent>(
        [&](EntityId, const EntityTypeComponent& t) {
            if (t.type != "agent") {
                return;
            }
            const std::string line =
                "Tick " + std::to_string(human_tick) + ": Agent moved";
            if (events_ && events_->enabled()) {
                events_->write(line);
            }
            if (trace_) {
                trace_->push_event(line);
            }
        });

    // later: real conflict logic — resolve faction intents, apply rules,
    // mutate world state, emit conflict events into the trace.
}

} // namespace pac
