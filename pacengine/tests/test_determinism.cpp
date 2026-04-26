// Determinism baseline: with PacData + ConflictSim enabled, two PacRuntime
// runs of the same job must reach identical tick counts and produce
// byte-identical traces.
//
// This is the new baseline test for PacEngine — every future change to
// the runtime, ECS, scheduler, or ConflictSim must keep this passing.

#include "ConflictSim.hpp"
#include "LocalWorker.hpp"
#include "PacData.hpp"
#include "PacDataLoader.hpp"
#include "PacRuntime.hpp"
#include "WorkerJob.hpp"
#include "World.hpp"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

namespace fs = std::filesystem;

namespace {

int fail(const std::string& msg) {
    std::cerr << "[determinism] FAIL: " << msg << '\n';
    return 1;
}

std::string read_file(const fs::path& p) {
    std::ifstream in(p, std::ios::binary);
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

} // namespace

int main() {
    // 1. PacData contract: demo loader returns PacData with ConflictSim enabled.
    pac::PacData data = pac::PacDataLoader::load_from_file("");
    pac::validate_versions(data.version);

    if (!data.world.conflict_sim.enabled) {
        return fail("demo PacData must have conflict_sim.enabled = true");
    }
    if (data.world.conflict_sim.scenarios.empty()) {
        return fail("demo PacData must define at least one conflict scenario");
    }

    // 2. ConflictSim wires up cleanly from PacData.
    pac::World      world(data);
    pac::ConflictSim conflict(world, data.world.conflict_sim);
    if (!conflict.enabled()) {
        return fail("ConflictSim should report enabled when configured so");
    }

    // 3. Two PacRuntime runs over the same PacData produce identical output.
    const fs::path tmp = fs::temp_directory_path() / "pacengine_determinism";
    fs::create_directories(tmp);

    const fs::path trace_a = tmp / "run_a.bin";
    const fs::path trace_b = tmp / "run_b.bin";

    constexpr std::uint64_t kTicks = 64;

    auto run = [&](const fs::path& trace_path) {
        pac::RuntimeConfig cfg;
        cfg.pacdata_file = "";  // use demo PacData
        cfg.max_ticks    = kTicks;
        cfg.record_trace = true;
        cfg.trace_path   = trace_path.string();

        pac::PacRuntime runtime(cfg);
        runtime.run();
        return runtime.tick();
    };

    const std::uint64_t ticks_a = run(trace_a);
    const std::uint64_t ticks_b = run(trace_b);

    if (ticks_a != kTicks || ticks_b != kTicks) {
        return fail("runtime did not reach the requested tick count");
    }
    if (read_file(trace_a) != read_file(trace_b)) {
        return fail("traces from identical PacData runs diverged");
    }

    // 4. Worker API: LocalWorker can drive the same job end-to-end.
    pac::LocalWorker worker;
    pac::WorkerJob   job;
    job.pacdata_file = "";
    job.ticks        = kTicks;
    if (worker.run_job(job) != 0) {
        return fail("LocalWorker.run_job returned non-zero");
    }

    std::cout << "[determinism] OK — " << kTicks
              << " ticks, ConflictSim enabled, traces match\n";
    return 0;
}
