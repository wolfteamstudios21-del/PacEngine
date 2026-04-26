#include "LocalWorker.hpp"
#include "WorkerJob.hpp"

#include <cstring>
#include <iostream>
#include <string>

// Tiny host that drives PacEngine through the WorkerAPI boundary,
// exactly the way PacCore will do it later.
//
// Usage:
//   pacengine_game [pacdata_file] [ticks]
//                  [--trace <path>] [--event-log <path>]
//
// The positional pacdata_file and ticks remain backwards compatible. The
// --trace and --event-log flags let an embedding host (the editor's
// api-server) capture deterministic artifacts at known paths.
int main(int argc, char** argv) {
    pac::WorkerJob job;
    job.ticks = 16ULL;

    int positional = 0;
    for (int i = 1; i < argc; ++i) {
        const char* a = argv[i];
        if (std::strcmp(a, "--trace") == 0 && i + 1 < argc) {
            job.trace_path = argv[++i];
        } else if (std::strcmp(a, "--event-log") == 0 && i + 1 < argc) {
            job.event_log_path = argv[++i];
        } else if (positional == 0) {
            job.pacdata_file = a;
            ++positional;
        } else if (positional == 1) {
            job.ticks = std::stoull(a);
            ++positional;
        }
    }

    pac::LocalWorker worker;
    const int rc = worker.run_job(job);

    std::cout << "pacengine_game finished after "
              << job.ticks << " ticks with exit=" << rc << '\n';
    return rc;
}
