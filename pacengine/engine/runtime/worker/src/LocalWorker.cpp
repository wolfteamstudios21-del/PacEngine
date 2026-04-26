#include "LocalWorker.hpp"

#include "PacRuntime.hpp"

#include <exception>

namespace pac {

int LocalWorker::run_job(const WorkerJob& job) {
    try {
        RuntimeConfig cfg;
        cfg.pacdata_file = job.pacdata_file;
        cfg.max_ticks    = job.ticks;
        cfg.record_trace = true;

        PacRuntime runtime(cfg);
        runtime.run();
        return 0;
    } catch (const std::exception&) {
        return 1;
    }
}

} // namespace pac
