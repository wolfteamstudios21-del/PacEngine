#pragma once

#include <cstdint>
#include <fstream>
#include <string>
#include <vector>

namespace pac {

class World;

// Append-only binary trace stream. Trace v2 is a framed, little-endian
// format (see TraceFormat.hpp). Each call to record_tick writes one
// frame containing every entity's component snapshot for that tick plus
// any events emitted during the tick.
//
// Determinism rules:
//   * Frames are written in tick order, never out of order.
//   * Component iteration order inside a frame matches the underlying
//     ComponentStorage insertion order.
//   * Every numeric field is written little-endian explicitly so byte
//     output is identical on big-endian hosts (none in our matrix today,
//     but the contract is honoured anyway).
class Trace {
public:
    explicit Trace(const std::string& path);
    ~Trace();

    Trace(const Trace&)            = delete;
    Trace& operator=(const Trace&) = delete;

    // Buffer an event line for the *current* tick. Events are written
    // out as part of the next record_tick call. record_tick clears the
    // buffer once flushed. Lines are bytes; any embedded newlines stay.
    void push_event(const std::string& line);

    void record_tick(const World& world, std::uint64_t tick);

    const std::string& path() const noexcept { return path_; }

private:
    void write_header();

    std::string                 path_;
    std::ofstream               out_;
    // Events for the in-progress tick. Cleared after each record_tick.
    std::vector<std::string>    pending_events_;
};

} // namespace pac
