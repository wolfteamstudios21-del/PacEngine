#include "PacRuntime.hpp"

#include "ConflictSim.hpp"
#include "IDatabase.hpp"
#include "PacDataLoader.hpp"
#include "Trace.hpp"
#include "World.hpp"

namespace pac {

PacRuntime::PacRuntime(const RuntimeConfig& cfg)
    : config_(cfg) {}

void PacRuntime::input_phase() {
    // later: drain network/input queues, materialize commands
}

void PacRuntime::gm_phase() {
    // later: dispatch to GM rules / authoring layer
}

void PacRuntime::simulation_phase(World& world, ConflictSim& conflict) {
    // later: ECS + scheduler systems
    if (conflict.enabled()) {
        conflict.tick(world, tick_);
    }
}

void PacRuntime::replication_phase() {
    // later: shard replication / snapshot diff out
}

void PacRuntime::run() {
    PacData data = PacDataLoader::load_from_file(config_.pacdata_file);
    validate_versions(data.version);

    World        world(data);
    ConflictSim  conflict(world, data.world.conflict_sim);
    Trace        trace(config_.trace_path);

    bool running = true;
    while (running) {
        input_phase();
        gm_phase();
        simulation_phase(world, conflict);
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
