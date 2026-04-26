#pragma once

#include "ConflictSim.hpp"
#include "World.hpp"

#include <cstdint>
#include <memory>
#include <string>

namespace pac {

class IDatabase;
class Trace;

struct RuntimeConfig {
    std::string   pacdata_file;        // PacData document on disk
    std::uint64_t max_ticks    = 0;    // 0 = run forever
    bool          record_trace = true;
    std::string   trace_path   = "trace_1.bin";
};

// PacRuntime is the PacCore v3 loop: input → gm → simulation → replication.
// Everything it needs about the world arrives via PacData.
class PacRuntime {
public:
    explicit PacRuntime(const RuntimeConfig& cfg);

    // Optional: inject a database for snapshots / trace persistence.
    void set_database(std::shared_ptr<IDatabase> db) { db_ = std::move(db); }

    // Drive the loop. Returns when max_ticks is reached or the runtime
    // is asked to stop.
    void run();

    std::uint64_t tick() const noexcept { return tick_; }

private:
    void input_phase();
    void gm_phase();
    void simulation_phase(World& world, ConflictSim& conflict);
    void replication_phase();

    RuntimeConfig              config_;
    std::uint64_t              tick_ = 0;
    std::shared_ptr<IDatabase> db_;
};

} // namespace pac
