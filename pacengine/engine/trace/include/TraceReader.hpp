#pragma once

#include "TraceFormat.hpp"

#include <cstdint>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace pac {

// In-memory representation of a single trace v2 frame. Reflects exactly
// what the writer recorded — entity ordering matches PacIdComponent
// insertion order on the source World.
struct TraceComponent {
    std::uint16_t              type_tag = 0;
    std::vector<std::uint8_t>  payload;
};

struct TraceEntity {
    std::uint32_t                index      = 0;
    std::uint32_t                generation = 0;
    std::vector<TraceComponent>  components;
};

struct TraceFrame {
    std::uint64_t                tick = 0;
    std::vector<TraceEntity>     entities;
    std::vector<std::string>     events;
};

// Reads a trace v2 file produced by `pac::Trace`. Loads the entire
// stream eagerly — fine for the editor use case (typically thousands of
// frames at most). Future iterations can switch to mmap + lazy frame
// indexing without changing the public API.
class TraceReader {
public:
    explicit TraceReader(const std::string& path);

    bool ok() const noexcept { return ok_; }
    const std::string& error() const noexcept { return error_; }

    std::uint16_t version() const noexcept { return version_; }
    std::size_t   frame_count() const noexcept { return frames_.size(); }
    const std::vector<TraceFrame>& frames() const noexcept { return frames_; }

    // Returns nullptr if the tick was not recorded.
    const TraceFrame* frame_at_tick(std::uint64_t tick) const;

    // Helpers that decode the standard payloads to typed values.
    static std::optional<std::string> decode_string(const TraceComponent& c);
    static std::optional<std::tuple<double, double, double>>
                                      decode_position(const TraceComponent& c);

private:
    bool                       ok_ = false;
    std::string                error_;
    std::uint16_t              version_ = 0;
    std::vector<TraceFrame>    frames_;
};

} // namespace pac
