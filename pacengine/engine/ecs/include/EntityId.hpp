#pragma once

#include <cstdint>
#include <functional>

namespace pac {

// Stable, generation-checked entity handle.
//
// `index` is the slot inside the World's entity allocator; `generation`
// is bumped every time that slot is recycled. A stale EntityId held over
// a destroy/create boundary will still compare equal to the recycled
// slot's index but its generation will not match — `World::is_alive`
// uses this to reject stale references safely and deterministically.
struct EntityId {
    std::uint32_t index      = 0;
    std::uint32_t generation = 0;

    constexpr bool operator==(const EntityId& o) const noexcept {
        return index == o.index && generation == o.generation;
    }

    constexpr bool operator!=(const EntityId& o) const noexcept {
        return !(*this == o);
    }

    constexpr bool operator<(const EntityId& o) const noexcept {
        return index < o.index ||
               (index == o.index && generation < o.generation);
    }

    constexpr std::uint64_t pack() const noexcept {
        return (static_cast<std::uint64_t>(generation) << 32) | index;
    }
};

inline constexpr EntityId kInvalidEntity{
    static_cast<std::uint32_t>(-1),
    static_cast<std::uint32_t>(-1)
};

} // namespace pac

namespace std {

template<>
struct hash<pac::EntityId> {
    std::size_t operator()(const pac::EntityId& e) const noexcept {
        return std::hash<std::uint64_t>{}(e.pack());
    }
};

} // namespace std
