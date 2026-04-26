#pragma once

#include "PacData.hpp"

#include <cstdint>
#include <string>

namespace pac {

// Minimal World stub built directly from a PacData document.
//
// This is intentionally tiny right now: ECS storage, shards, GMs and
// entities all land here in later milestones. The point today is to
// preserve the PacData-first contract: World is constructed from PacData
// and exposes whatever the rest of the runtime needs.
class World {
public:
    explicit World(const PacData& data);

    const std::string& name() const noexcept { return name_; }
    std::uint64_t      tick() const noexcept { return tick_; }

    void advance_tick() noexcept { ++tick_; }

private:
    std::string   name_;
    std::uint64_t tick_ = 0;
};

} // namespace pac
