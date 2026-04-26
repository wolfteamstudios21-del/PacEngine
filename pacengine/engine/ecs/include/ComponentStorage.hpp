#pragma once

#include "EntityId.hpp"

#include <cstddef>
#include <unordered_map>
#include <utility>
#include <vector>

namespace pac {

// Type-erased base so the World can hold heterogeneous component storages
// in a single container.
class IComponentStorage {
public:
    virtual ~IComponentStorage() = default;

    virtual std::size_t size() const noexcept                = 0;
    virtual bool        contains(EntityId entity) const noexcept = 0;
    virtual void        remove(EntityId entity)             = 0;
};

// Dense per-component storage with deterministic insertion-order
// iteration. Inserts append; removes shift to preserve order. Lookups
// go through an index map for O(1) access.
//
// Determinism property: `for_each` always visits components in the order
// they were inserted, regardless of platform, hash seed, or compiler.
template<typename T>
class ComponentStorage final : public IComponentStorage {
public:
    T& add(EntityId entity, T value) {
        if (auto it = index_.find(entity); it != index_.end()) {
            dense_[it->second] = std::move(value);
            return dense_[it->second];
        }
        const std::size_t slot = dense_.size();
        index_.emplace(entity, slot);
        entities_.push_back(entity);
        dense_.push_back(std::move(value));
        return dense_.back();
    }

    T* get(EntityId entity) {
        auto it = index_.find(entity);
        return it == index_.end() ? nullptr : &dense_[it->second];
    }

    const T* get(EntityId entity) const {
        auto it = index_.find(entity);
        return it == index_.end() ? nullptr : &dense_[it->second];
    }

    bool contains(EntityId entity) const noexcept override {
        return index_.find(entity) != index_.end();
    }

    void remove(EntityId entity) override {
        auto it = index_.find(entity);
        if (it == index_.end()) {
            return;
        }
        const std::size_t idx = it->second;

        dense_.erase(dense_.begin() + static_cast<std::ptrdiff_t>(idx));
        entities_.erase(entities_.begin() + static_cast<std::ptrdiff_t>(idx));
        index_.erase(it);

        // Shift trailing indices down to preserve insertion order.
        for (auto& kv : index_) {
            if (kv.second > idx) {
                --kv.second;
            }
        }
    }

    std::size_t size() const noexcept override { return dense_.size(); }

    template<typename Fn>
    void for_each(Fn&& fn) {
        for (std::size_t i = 0; i < dense_.size(); ++i) {
            fn(entities_[i], dense_[i]);
        }
    }

    template<typename Fn>
    void for_each(Fn&& fn) const {
        for (std::size_t i = 0; i < dense_.size(); ++i) {
            fn(entities_[i], dense_[i]);
        }
    }

private:
    std::vector<T>                            dense_;
    std::vector<EntityId>                     entities_;
    std::unordered_map<EntityId, std::size_t> index_;
};

} // namespace pac
