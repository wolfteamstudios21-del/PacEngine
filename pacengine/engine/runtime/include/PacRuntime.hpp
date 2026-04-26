#pragma once

#include "Scheduler.hpp"

#include <cstdint>
#include <memory>
#include <string>

namespace pac {

class IDatabase;
class Trace;
class World;

struct RuntimeConfig {
    std::string   pacdata_file;        // PacData document on disk
    std::uint64_t max_ticks    = 0;    // 0 = run forever
    bool          record_trace = true;
    std::string   trace_path   = "trace_1.bin";
    // Optional per-run human-readable event log. Empty == disabled.
    std::string   event_log_path;
};

// PacRuntime is the PacCore v3 loop: input → gm → simulation → replication.
// The simulation phase delegates to a fixed-order Scheduler that owns
// every system in the engine, including ConflictSim.
class PacRuntime {
public:
    explicit PacRuntime(const RuntimeConfig& cfg);

    // Optional: inject a database for snapshots / trace persistence.
    void set_database(std::shared_ptr<IDatabase> db) { db_ = std::move(db); }

    void run();

    std::uint64_t tick() const noexcept { return tick_; }

private:
    void input_phase();
    void gm_phase();
    void simulation_phase(Scheduler& scheduler, World& world);
    void replication_phase();

    RuntimeConfig              config_;
    std::uint64_t              tick_ = 0;
    std::shared_ptr<IDatabase> db_;
};

} // namespace pac
