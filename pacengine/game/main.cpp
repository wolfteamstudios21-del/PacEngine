#include "LocalWorker.hpp"
#include "WorkerJob.hpp"

#include <iostream>
#include <string>

// Tiny host that drives PacEngine through the WorkerAPI boundary,
// exactly the way PacCore will do it later.
//
// Usage: pacengine_game [pacdata_file] [ticks]
int main(int argc, char** argv) {
    pac::WorkerJob job;
    job.pacdata_file = (argc > 1) ? argv[1] : "";  // empty -> demo PacData
    job.ticks        = (argc > 2) ? std::stoull(argv[2]) : 16ULL;

    pac::LocalWorker worker;
    const int rc = worker.run_job(job);

    std::cout << "pacengine_game finished after "
              << job.ticks << " ticks with exit=" << rc << '\n';
    return rc;
}
