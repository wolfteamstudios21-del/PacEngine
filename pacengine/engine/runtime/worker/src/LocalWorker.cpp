#include "LocalWorker.hpp"

#include "PacRuntime.hpp"

#include <exception>

namespace pac {

// Each call constructs its own RuntimeConfig and PacRuntime — there is
// deliberately no shared state between jobs. Two LocalWorker.run_job()
// calls over the same PacData and tick budget must therefore produce
// byte-identical artifacts (trace + event log).
int LocalWorker::run_job(const WorkerJob& job) {
    try {
        RuntimeConfig cfg;
        cfg.pacdata_file   = job.pacdata_file;
        cfg.max_ticks      = job.ticks;
        cfg.record_trace   = true;
        if (!job.trace_path.empty()) {
            cfg.trace_path = job.trace_path;
        }
        cfg.event_log_path = job.event_log_path;

        PacRuntime runtime(cfg);
        runtime.run();
        return 0;
    } catch (const std::exception&) {
        return 1;
    }
}

} // namespace pac
