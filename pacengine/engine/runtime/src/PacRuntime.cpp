#include "PacRuntime.hpp"

#include "ConflictSim.hpp"
#include "EventLog.hpp"
#include "IDatabase.hpp"
#include "MovementSystem.hpp"
#include "PacDataLoader.hpp"
#include "Scheduler.hpp"
#include "Trace.hpp"
#include "World.hpp"

#include <memory>

namespace pac {

PacRuntime::PacRuntime(const RuntimeConfig& cfg)
    : config_(cfg) {}

void PacRuntime::input_phase() {
    // later: drain network/input queues, materialize commands
}

void PacRuntime::gm_phase() {
    // later: dispatch to GM rules / authoring layer
}

void PacRuntime::simulation_phase(Scheduler& scheduler, World& world) {
    scheduler.tick(world, tick_);
}

void PacRuntime::replication_phase() {
    // later: shard replication / snapshot diff out
}

void PacRuntime::run() {
    PacData data = PacDataLoader::load_from_file(config_.pacdata_file);
    validate_versions(data.version);

    World world(data);

    // Optional human-readable per-run log. Disabled when path is empty,
    // in which case ConflictSim writes nothing through it (and the
    // EventLog file stays absent — trace v2 still records events
    // independently in each frame).
    EventLog events(config_.event_log_path);

    Trace trace(config_.trace_path);

    // The scheduler owns every system. Order matters for determinism:
    //   1) ConflictSim — emits human-readable events about agents.
    //   2) MovementSystem — mutates PositionComponent.
    // Both run *before* trace.record_tick captures the frame, so the
    // event log lines and the position values reflect the same tick.
    Scheduler scheduler;
    scheduler.add_system(std::make_unique<ConflictSim>(
        world, data.world.conflict_sim, &events, &trace));
    scheduler.add_system(std::make_unique<MovementSystem>());

    bool running = true;
    while (running) {
        input_phase();
        gm_phase();
        simulation_phase(scheduler, world);
        replication_phase();

        if (config_.record_trace) {
            trace.record_tick(world, tick_);
        }
        if (db_) {
            db_->save_world_state(world, tick_);
        }

        world.advance_tick();
        ++tick_;

        if (config_.max_ticks > 0 && tick_ >= config_.max_ticks) {
            running = false;
        }
    }
}

} // namespace pac
