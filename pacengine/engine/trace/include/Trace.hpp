#pragma once

#include <cstdint>
#include <fstream>
#include <string>

namespace pac {

class World;

// Append-only binary trace stream. Today it just records per-tick markers;
// later it grows to a structured chunked format that the database layer
// can fan out and the editor can scrub through.
class Trace {
public:
    explicit Trace(const std::string& path);
    ~Trace();

    Trace(const Trace&)            = delete;
    Trace& operator=(const Trace&) = delete;

    void record_tick(const World& world, std::uint64_t tick);

    const std::string& path() const noexcept { return path_; }

private:
    std::string   path_;
    std::ofstream out_;
};

} // namespace pac
