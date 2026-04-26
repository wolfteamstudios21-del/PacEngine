#pragma once

#include <cstddef>
#include <cstdint>

namespace pac {

class World;

// Engine-level database abstraction. PacEngine never talks to a specific
// storage backend directly: every backend (local file, SQLite, hosted
// PacCore service) implements this interface.
class IDatabase {
public:
    virtual ~IDatabase() = default;

    virtual void save_world_state(const World& world, std::uint64_t tick) = 0;
    virtual void save_trace_chunk(const void* data, std::size_t size)     = 0;
};

} // namespace pac
