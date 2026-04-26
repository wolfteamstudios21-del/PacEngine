#pragma once

#include "WorkerJob.hpp"

namespace pac {

// Boundary between PacEngine and any autoscaling layer (PacCore / Fly.io
// / a single laptop). PacEngine exposes WorkerAPI; whatever runs on the
// other side decides how many workers exist, where they live, and how
// jobs are routed.
class WorkerAPI {
public:
    virtual ~WorkerAPI() = default;

    // Run a single job to completion. Returns 0 on success, non-zero on
    // failure (matching standard process exit-code conventions).
    virtual int run_job(const WorkerJob& job) = 0;
};

} // namespace pac
