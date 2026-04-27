#include "MovementSystem.hpp"

#include "Components.hpp"
#include "World.hpp"

#include <cmath>

namespace pac {

namespace {

// Pure deterministic delta function. Same inputs ⇒ same output across
// every platform we care about. Uses sin/cos on integer-derived radians
// rather than floating-point accumulation so round-off can't drift.
//
// The pattern is intentionally simple: each entity slot orbits a small
// circle whose radius and phase depend on the slot index. This produces
// visually obvious motion in the viewport without requiring a real
// physics step.
struct Delta {
    double dx;
    double dz;
};

Delta delta_for(std::uint32_t slot, std::uint64_t tick) {
    const double phase  = static_cast<double>(slot) * 0.7853981633974483; // pi/4
    const double radius = 0.05 + (static_cast<double>(slot % 5) * 0.01);
    const double t      = static_cast<double>(tick) * 0.1;
    return Delta{
        std::cos(t + phase) * radius,
        std::sin(t + phase) * radius,
    };
}

} // namespace

void MovementSystem::tick(World& world, std::uint64_t tick) {
    world.for_each<PositionComponent>(
        [&](EntityId id, PositionComponent& p) {
            const Delta d = delta_for(id.index, tick);
            p.x += d.dx;
            p.z += d.dz;
        });
}

} // namespace pac
