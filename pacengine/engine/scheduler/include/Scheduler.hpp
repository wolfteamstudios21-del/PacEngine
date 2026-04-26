#pragma once

#include "ISystem.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

namespace pac {

class World;

// Fixed-order system scheduler.
//
// Systems run in the exact order they were added, every tick, every run.
// There is intentionally no parallelism, no ordering hints, and no
// dependency graph in v1 — determinism is the headline property and any
// future ordering must be expressed as an explicit, data-driven
// declaration that survives serialization.
class Scheduler {
public:
    void add_system(std::unique_ptr<ISystem> system);

    void tick(World& world, std::uint64_t tick);

    std::size_t       system_count() const noexcept { return systems_.size(); }
    const ISystem&    system_at(std::size_t i) const { return *systems_[i]; }

private:
    std::vector<std::unique_ptr<ISystem>> systems_;
};

} // namespace pac
