#include "Scheduler.hpp"

namespace pac {

void Scheduler::add_system(std::unique_ptr<ISystem> system) {
    if (system) {
        systems_.push_back(std::move(system));
    }
}

void Scheduler::tick(World& world, std::uint64_t tick) {
    for (auto& s : systems_) {
        s->tick(world, tick);
    }
}

} // namespace pac
