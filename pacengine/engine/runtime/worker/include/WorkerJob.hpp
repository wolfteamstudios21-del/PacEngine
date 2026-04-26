#pragma once

#include <cstdint>
#include <string>

namespace pac {

// A unit of work PacEngine knows how to execute. PacCore (or any other
// orchestrator) hands jobs to a WorkerAPI implementation; PacEngine itself
// never decides where or how to scale.
struct WorkerJob {
    std::string   pacdata_file;
    std::uint64_t ticks = 0;
};

} // namespace pac
