#include "World.hpp"

#include "Components.hpp"

#include <cstdint>

namespace pac {

namespace {

// FNV-1a 64-bit hash over a string. Used purely as a deterministic seed
// for default entity positions when PacData omits coordinates. Same
// algorithm runs in TS-side editor code so the visual placement matches
// even before the engine ships positions through trace v2.
std::uint64_t fnv1a64(const std::string& s) {
    std::uint64_t h = 0xcbf29ce484222325ULL;
    for (unsigned char c : s) {
        h ^= c;
        h *= 0x100000001b3ULL;
    }
    return h;
}

PositionComponent default_position_for(const std::string& pac_id) {
    // Spread entities on a 10x10 grid centred on the origin. Stable
    // across runs / platforms because FNV-1a is.
    const std::uint64_t h = fnv1a64(pac_id);
    const double gx = static_cast<double>((h        & 0xFFu)) / 255.0;
    const double gz = static_cast<double>(((h >> 8) & 0xFFu)) / 255.0;
    return PositionComponent{
        (gx - 0.5) * 10.0,
        0.0,
        (gz - 0.5) * 10.0,
    };
}

} // namespace

World::World(const PacData& data)
    : name_(data.world.name) {
    // Materialize PacData entities into the ECS in document order.
    // Each one gets a PacIdComponent so systems can map back to the
    // source PacData id without leaking PacData types into the ECS.
    for (const auto& entity_def : data.world.entities) {
        const EntityId e = create_entity();
        add_component<PacIdComponent>(e, PacIdComponent{entity_def.id});
        if (!entity_def.type.empty()) {
            add_component<EntityTypeComponent>(
                e, EntityTypeComponent{entity_def.type});
        }
        // Position: prefer the PacData-supplied value; otherwise fall
        // back to a deterministic default so the editor viewport always
        // has something to render.
        PositionComponent p;
        if (entity_def.position.has_value()) {
            p.x = entity_def.position->x;
            p.y = entity_def.position->y;
            p.z = entity_def.position->z;
        } else {
            p = default_position_for(entity_def.id);
        }
        add_component<PositionComponent>(e, p);
    }
}

EntityId World::create_entity() {
    if (!free_indices_.empty()) {
        const std::uint32_t idx = free_indices_.back();
        free_indices_.pop_back();
        alive_[idx] = true;
        ++alive_count_;
        return EntityId{idx, generations_[idx]};
    }

    const std::uint32_t idx = static_cast<std::uint32_t>(generations_.size());
    generations_.push_back(0);
    alive_.push_back(true);
    ++alive_count_;
    return EntityId{idx, 0};
}

void World::destroy_entity(EntityId entity) {
    if (!is_alive(entity)) {
        return;
    }

    // Remove components from every storage. Storage map order does not
    // matter for correctness — only ComponentStorage::for_each order is
    // observable, and that uses the dense vector.
    for (auto& kv : storages_) {
        kv.second->remove(entity);
    }

    alive_[entity.index] = false;
    ++generations_[entity.index];
    free_indices_.push_back(entity.index);
    --alive_count_;
}

bool World::is_alive(EntityId entity) const noexcept {
    if (entity.index >= alive_.size()) {
        return false;
    }
    return alive_[entity.index] &&
           generations_[entity.index] == entity.generation;
}

} // namespace pac
