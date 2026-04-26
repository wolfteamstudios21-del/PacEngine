#pragma once

#include <cstdint>
#include <string>

namespace pac {

class World;

// A system is a unit of per-tick simulation work. Systems are run by the
// Scheduler in a fixed insertion order — that ordering is the ECS
// determinism contract.
class ISystem {
public:
    virtual ~ISystem() = default;

    virtual std::string name() const                              = 0;
    virtual void        tick(World& world, std::uint64_t tick)    = 0;
};

} // namespace pac
