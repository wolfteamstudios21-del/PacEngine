#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace pac {

// Result of comparing two trace v2 files frame-by-frame. `entries` is
// empty when the traces are identical. `first_divergence_tick` is set
// to the first tick where any difference was observed.
struct TraceDiffEntry {
    std::uint64_t tick;
    std::string   kind;    // entity_added | entity_removed | entity_changed | event_diff | frame_size_diff
    std::string   detail;
};

struct TraceDiffResult {
    bool                          identical = true;
    std::optional<std::uint64_t>  first_divergence_tick;
    std::vector<TraceDiffEntry>   entries;
};

// Loads both traces and reports the first divergence plus a bounded
// list of follow-up entries (capped at 100 to keep editor payloads
// reasonable). Errors loading either file produce a single entry with
// kind="frame_size_diff" describing the load failure and identical=false.
class TraceDiff {
public:
    static TraceDiffResult diff(const std::string& path_a,
                                const std::string& path_b,
                                std::size_t max_entries = 100);
};

} // namespace pac
