#pragma once

#include "ComponentStorage.hpp"
#include "Components.hpp"
#include "EntityId.hpp"
#include "PacData.hpp"

#include <cstdint>
#include <memory>
#include <string>
#include <typeindex>
#include <unordered_map>
#include <vector>

namespace pac {

// World owns the entity allocator and all component storages. It is built
// from a PacData document at construction time and exposes a small,
// type-erased ECS API on top of `ComponentStorage<T>`.
//
// Determinism rules:
//   * `create_entity` returns indices in a strictly defined order:
//     recycled slots first (LIFO from the free list), then fresh slots.
//   * `destroy_entity` bumps the slot's generation, removes all components
//     for that entity, and pushes the slot onto the free list.
//   * `for_each<T>` iterates components in insertion order (see
//     ComponentStorage).
class World {
public:
    explicit World(const PacData& data);

    // Identity / clock
    const std::string& name() const noexcept { return name_; }
    std::uint64_t      tick() const noexcept { return tick_; }
    void               advance_tick() noexcept { ++tick_; }

    // Entity API
    EntityId    create_entity();
    void        destroy_entity(EntityId entity);
    bool        is_alive(EntityId entity) const noexcept;
    std::size_t entity_count() const noexcept { return alive_count_; }

    // Component API
    template<typename T>
    T& add_component(EntityId entity, T value) {
        return storage<T>().add(entity, std::move(value));
    }

    template<typename T>
    T* get_component(EntityId entity) {
        auto* s = find_storage<T>();
        return s ? s->get(entity) : nullptr;
    }

    template<typename T>
    const T* get_component(EntityId entity) const {
        const auto* s = find_storage<T>();
        return s ? s->get(entity) : nullptr;
    }

    template<typename T>
    bool has_component(EntityId entity) const {
        const auto* s = find_storage<T>();
        return s != nullptr && s->contains(entity);
    }

    // Deterministic iteration over a component type.
    template<typename T, typename Fn>
    void for_each(Fn&& fn) {
        if (auto* s = find_storage<T>(); s != nullptr) {
            s->for_each(std::forward<Fn>(fn));
        }
    }

    template<typename T, typename Fn>
    void for_each(Fn&& fn) const {
        if (const auto* s = find_storage<T>(); s != nullptr) {
            s->for_each(std::forward<Fn>(fn));
        }
    }

private:
    template<typename T>
    ComponentStorage<T>& storage() {
        auto& slot = storages_[std::type_index(typeid(T))];
        if (!slot) {
            slot = std::make_unique<ComponentStorage<T>>();
        }
        return *static_cast<ComponentStorage<T>*>(slot.get());
    }

    template<typename T>
    ComponentStorage<T>* find_storage() {
        auto it = storages_.find(std::type_index(typeid(T)));
        if (it == storages_.end()) {
            return nullptr;
        }
        return static_cast<ComponentStorage<T>*>(it->second.get());
    }

    template<typename T>
    const ComponentStorage<T>* find_storage() const {
        auto it = storages_.find(std::type_index(typeid(T)));
        if (it == storages_.end()) {
            return nullptr;
        }
        return static_cast<const ComponentStorage<T>*>(it->second.get());
    }

    std::string   name_;
    std::uint64_t tick_ = 0;

    // Entity allocator state.
    std::vector<std::uint32_t> generations_;   // index -> current generation
    std::vector<bool>          alive_;         // index -> is alive
    std::vector<std::uint32_t> free_indices_;  // recycled slots (LIFO)
    std::size_t                alive_count_ = 0;

    std::unordered_map<std::type_index,
                       std::unique_ptr<IComponentStorage>> storages_;
};

} // namespace pac
