// End-to-end "agent demo" test for the PacData → World → Runtime →
// Scheduler → ConflictSim → EventLog chain.
//
// The fixture is the canonical one-agent PacData document at
// `examples/agent_world.pacdata.json`. This test asserts:
//
//   1. The loader parses a real on-disk PacData file (id, type, enabled).
//   2. After 100 ticks, the EventLog contains exactly 100 lines, each of
//      the form "Tick N: Agent moved" with N going 1..100 in order.
//   3. Two independent runs over the same PacData produce byte-identical
//      EventLog files (the user-visible determinism baseline).
//
// If line (3) ever fails, do not paper over it — stop and find the
// non-determinism.

#include "PacRuntime.hpp"

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace {

int fail(const std::string& msg) {
    std::cerr << "[agent_demo] FAIL: " << msg << '\n';
    return 1;
}

std::string read_file(const fs::path& p) {
    std::ifstream in(p, std::ios::binary);
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

std::vector<std::string> split_lines(const std::string& blob) {
    std::vector<std::string> out;
    std::string              cur;
    for (const char c : blob) {
        if (c == '\n') {
            out.push_back(std::move(cur));
            cur.clear();
        } else {
            cur += c;
        }
    }
    if (!cur.empty()) {
        out.push_back(std::move(cur));
    }
    return out;
}

// Resolve the PacData fixture path. CTest sets the working directory to
// the test binary's location, so we walk up until we find `examples/`.
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

    const fs::path tmp = fs::temp_directory_path() / "pacengine_agent_demo";
    fs::create_directories(tmp);

    constexpr std::uint64_t kTicks = 100;

    auto run = [&](const fs::path& trace, const fs::path& log) {
        pac::RuntimeConfig cfg;
        cfg.pacdata_file   = fixture.string();
        cfg.max_ticks      = kTicks;
        cfg.record_trace   = true;
        cfg.trace_path     = trace.string();
        cfg.event_log_path = log.string();

        pac::PacRuntime runtime(cfg);
        runtime.run();
    };

    const fs::path trace_1 = tmp / "trace_1.bin";
    const fs::path trace_2 = tmp / "trace_2.bin";
    const fs::path log_1   = tmp / "run_1.log";
    const fs::path log_2   = tmp / "run_2.log";

    run(trace_1, log_1);

    const std::string log_1_text = read_file(log_1);
    const auto        lines      = split_lines(log_1_text);

    if (lines.size() != kTicks) {
        return fail("expected 100 log lines, got " +
                    std::to_string(lines.size()));
    }
    for (std::uint64_t i = 0; i < kTicks; ++i) {
        const std::string expected =
            "Tick " + std::to_string(i + 1) + ": Agent moved";
        if (lines[i] != expected) {
            return fail("line " + std::to_string(i + 1) + " was '" +
                        lines[i] + "', expected '" + expected + "'");
        }
    }

    run(trace_2, log_2);

    if (read_file(log_1) != read_file(log_2)) {
        return fail("event logs from two identical runs diverged");
    }
    if (read_file(trace_1) != read_file(trace_2)) {
        return fail("traces from two identical runs diverged");
    }

    std::cout << "[agent_demo] OK — 100 ticks, 100 'Agent moved' lines, "
                 "log + trace byte-identical across runs\n";
    return 0;
}
