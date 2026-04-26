// Focused ECS + Scheduler test for v0.0.3.
//
// Asserts:
//   - Entity allocator gives sequential indices starting at gen 0
//   - add_component / get_component round-trip
//   - for_each iterates components in insertion order (deterministic)
//   - destroy_entity removes components and bumps the slot generation
//   - recycled slots reuse the index but never the (index, gen) pair
//   - Scheduler runs systems in fixed insertion order across ticks
//   - World built from a PacData document materializes one entity per
//     EntityDef, in document order, each carrying a PacIdComponent.

#include "Components.hpp"
#include "EntityId.hpp"
#include "PacData.hpp"
#include "Scheduler.hpp"
#include "World.hpp"

#include <iostream>
#include <memory>
#include <string>
#include <vector>

namespace {

int fail(const std::string& msg) {
    std::cerr << "[ecs] FAIL: " << msg << '\n';
    return 1;
}

class RecordingSystem final : public pac::ISystem {
public:
    RecordingSystem(std::string n, std::vector<std::string>* log)
        : name_(std::move(n))
        , log_(log) {}

    std::string name() const override { return name_; }

    void tick(pac::World& /*w*/, std::uint64_t /*t*/) override {
        log_->push_back(name_);
    }

private:
    std::string               name_;
    std::vector<std::string>* log_;
};

} // namespace

int main() {
    // 1. Construct a World from an empty PacData document.
    pac::PacData empty;
    empty.version.pacdata = "1.0.0";
    empty.version.paccore = "3.0.0";
    empty.world.name      = "empty";

    pac::World world(empty);
    if (world.entity_count() != 0) {
        return fail("empty world should have 0 entities");
    }

    // 2. Entity allocator: indices 0..N, generation 0.
    const pac::EntityId a = world.create_entity();
    const pac::EntityId b = world.create_entity();
    const pac::EntityId c = world.create_entity();
    if (a.index != 0 || a.generation != 0)         return fail("first entity must be {0,0}");
    if (b.index != 1)                               return fail("second entity index must be 1");
    if (c.index != 2)                               return fail("third entity index must be 2");
    if (!world.is_alive(a) || !world.is_alive(b) || !world.is_alive(c))
        return fail("freshly created entities must be alive");
    if (world.entity_count() != 3)
        return fail("entity_count must be 3 after three create_entity calls");

    // 3. Add components, read them back.
    world.add_component<pac::PacIdComponent>(a, {"alpha"});
    world.add_component<pac::PacIdComponent>(b, {"beta"});
    world.add_component<pac::PacIdComponent>(c, {"gamma"});

    if (auto* p = world.get_component<pac::PacIdComponent>(a);
        !p || p->pac_id != "alpha")
        return fail("a.PacIdComponent should be 'alpha'");
    if (auto* p = world.get_component<pac::PacIdComponent>(b);
        !p || p->pac_id != "beta")
        return fail("b.PacIdComponent should be 'beta'");
    if (!world.has_component<pac::PacIdComponent>(c))
        return fail("c should have PacIdComponent");

    // 4. for_each iterates in insertion order.
    std::vector<std::string> ids;
    world.for_each<pac::PacIdComponent>(
        [&](pac::EntityId, const pac::PacIdComponent& comp) {
            ids.push_back(comp.pac_id);
        });
    if (ids != std::vector<std::string>{"alpha", "beta", "gamma"})
        return fail("for_each must iterate in insertion order");

    // 5. Destroy + recycle: slot reused, generation bumped, components dropped.
    world.destroy_entity(b);
    if (world.is_alive(b))
        return fail("destroyed entity must report not alive");
    if (world.entity_count() != 2)
        return fail("entity_count after destroy should be 2");
    if (world.has_component<pac::PacIdComponent>(b))
        return fail("destroyed entity must drop its components");

    const pac::EntityId d = world.create_entity();
    if (d.index != b.index)
        return fail("recycled slot must reuse index");
    if (d.generation == b.generation)
        return fail("recycled slot must bump generation");
    if (world.is_alive(b))
        return fail("stale EntityId for recycled slot must not be alive");
    if (!world.is_alive(d))
        return fail("freshly recycled entity must be alive");

    // 6. Scheduler: fixed order across ticks.
    std::vector<std::string> log;
    pac::Scheduler scheduler;
    scheduler.add_system(std::make_unique<RecordingSystem>("first",  &log));
    scheduler.add_system(std::make_unique<RecordingSystem>("second", &log));
    scheduler.add_system(std::make_unique<RecordingSystem>("third",  &log));
    if (scheduler.system_count() != 3)
        return fail("scheduler should report 3 systems");

    scheduler.tick(world, 0);
    scheduler.tick(world, 1);

    const std::vector<std::string> expected = {
        "first", "second", "third",
        "first", "second", "third",
    };
    if (log != expected)
        return fail("scheduler must run systems in fixed insertion order");

    // 7. World built from PacData → ECS, in document order.
    pac::PacData data;
    data.version.pacdata = "1.0.0";
    data.version.paccore = "3.0.0";
    data.world.name      = "from_pacdata";
    data.world.entities.push_back(pac::EntityDef{"unit_x"});
    data.world.entities.push_back(pac::EntityDef{"unit_y"});

    pac::World w2(data);
    if (w2.entity_count() != 2)
        return fail("World should populate ECS from PacData entities");

    std::vector<std::string> pac_ids;
    w2.for_each<pac::PacIdComponent>(
        [&](pac::EntityId, const pac::PacIdComponent& comp) {
            pac_ids.push_back(comp.pac_id);
        });
    if (pac_ids != std::vector<std::string>{"unit_x", "unit_y"})
        return fail("PacData entity ids must populate PacIdComponent in order");

    std::cout << "[ecs] OK — entity allocator, components, scheduler, "
                 "PacData→ECS\n";
    return 0;
}
