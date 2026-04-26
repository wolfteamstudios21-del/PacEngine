#include "World.hpp"

#include "Components.hpp"

namespace pac {

World::World(const PacData& data)
    : name_(data.world.name) {
    // Materialize PacData entities into the ECS in document order.
    // Each one gets a PacIdComponent so systems can map back to the
    // source PacData id without leaking PacData types into the ECS.
    for (const auto& entity_def : data.world.entities) {
        const EntityId e = create_entity();
        add_component<PacIdComponent>(e, PacIdComponent{entity_def.id});
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
