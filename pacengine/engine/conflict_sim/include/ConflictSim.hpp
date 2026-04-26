#pragma once

#include "ISystem.hpp"
#include "PacData.hpp"

#include <cstdint>
#include <string>

namespace pac {

class EventLog;
class World;

// Native ConflictSim module. It is part of the engine — not a plugin —
// but it is *driven by data* through ConflictSimConfig in PacData.
//
// As of v0.0.3 ConflictSim is also the first concrete `ISystem`: the
// PacRuntime registers it on the Scheduler instead of calling its tick
// directly. That keeps the scheduler the single source of ordering
// truth, even for built-in modules.
//
// As of v0.0.4 ConflictSim performs a deterministic per-tick "movement"
// step over every entity tagged with EntityTypeComponent{"agent"}, and
// emits one human-readable line per moved agent into an EventLog when
// one is provided. The lines are the operator-visible proof that the
// loader → world → runtime → scheduler → conflict-sim chain is wired
// correctly end-to-end.
class ConflictSim final : public ISystem {
public:
    ConflictSim(World& world,
                const ConflictSimConfig& cfg,
                EventLog* events = nullptr);

    bool                     enabled() const noexcept { return enabled_; }
    const ConflictSimConfig& config()  const noexcept { return config_;  }

    // ISystem
    std::string name() const override { return "conflict_sim"; }
    void        tick(World& world, std::uint64_t tick) override;

private:
    bool              enabled_;
    ConflictSimConfig config_;
    EventLog*         events_; // not owned; may be null
};

} // namespace pac
