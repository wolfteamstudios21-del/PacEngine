// Worker isolation test: two LocalWorker.run_job() calls over the same
// PacData and tick budget must:
//
//   - both succeed,
//   - share no in-process state (one worker, two sequential calls;
//     and a second pair of calls on a *fresh* worker for good measure),
//   - produce byte-identical event logs and traces.
//
// This is the proof for the "no shared state, same results every time"
// requirement from the v0.0.4 plan.

#include "LocalWorker.hpp"
#include "WorkerJob.hpp"

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

namespace fs = std::filesystem;

namespace {

int fail(const std::string& msg) {
    std::cerr << "[worker_isolation] FAIL: " << msg << '\n';
    return 1;
}

std::string read_file(const fs::path& p) {
    std::ifstream in(p, std::ios::binary);
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

fs::path locate_fixture() {
    fs::path here = fs::current_path();
    for (int hops = 0; hops < 6; ++hops) {
        const fs::path candidate =
            here / "examples" / "agent_world.pacdata.json";
        if (fs::exists(candidate)) return candidate;
        if (!here.has_parent_path()) break;
        here = here.parent_path();
    }
    return {};
}

} // namespace

int main() {
    const fs::path fixture = locate_fixture();
    if (fixture.empty()) {
        return fail("could not locate examples/agent_world.pacdata.json");
    }

    const fs::path tmp = fs::temp_directory_path() / "pacengine_worker_iso";
    fs::create_directories(tmp);

    constexpr std::uint64_t kTicks = 100;

    auto make_job = [&](const std::string& tag) {
        pac::WorkerJob job;
        job.pacdata_file   = fixture.string();
        job.ticks          = kTicks;
        job.trace_path     = (tmp / (tag + ".trace.bin")).string();
        job.event_log_path = (tmp / (tag + ".log")).string();
        return job;
    };

    pac::WorkerJob job1 = make_job("job1");
    pac::WorkerJob job2 = make_job("job2");

    // Two jobs through the same worker instance — must not bleed state.
    pac::LocalWorker worker;
    if (worker.run_job(job1) != 0) return fail("job1 returned non-zero");
    if (worker.run_job(job2) != 0) return fail("job2 returned non-zero");

    if (read_file(job1.event_log_path) != read_file(job2.event_log_path)) {
        return fail("event logs across two jobs on same worker diverged");
    }
    if (read_file(job1.trace_path) != read_file(job2.trace_path)) {
        return fail("traces across two jobs on same worker diverged");
    }

    // And again on a brand-new worker — must match the first pair, too.
    pac::WorkerJob job3 = make_job("job3");
    pac::LocalWorker fresh;
    if (fresh.run_job(job3) != 0) return fail("job3 returned non-zero");

    if (read_file(job3.event_log_path) != read_file(job1.event_log_path)) {
        return fail("fresh worker produced a different event log");
    }
    if (read_file(job3.trace_path) != read_file(job1.trace_path)) {
        return fail("fresh worker produced a different trace");
    }

    std::cout << "[worker_isolation] OK — two jobs on one worker + a "
                 "third on a fresh worker all match byte-for-byte\n";
    return 0;
}
