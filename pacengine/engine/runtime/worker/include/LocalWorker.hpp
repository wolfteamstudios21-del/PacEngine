#pragma once

#include "WorkerAPI.hpp"

namespace pac {

// Default WorkerAPI implementation: spins up an in-process PacRuntime
// for each job. PacCore later wraps this (or replaces it) with a
// distributed scheduler.
class LocalWorker final : public WorkerAPI {
public:
    LocalWorker() = default;

    int run_job(const WorkerJob& job) override;
};

} // namespace pac
