#pragma once

#include <fstream>
#include <string>

namespace pac {

// Append-only, line-oriented log of human-readable events emitted by
// systems during a simulation run. Distinct from `Trace` (which is the
// machine-readable, byte-stable record): this is what an operator or a
// test reads to confirm a run actually did what it was supposed to do.
//
// Determinism rule: if the systems writing into an EventLog are
// themselves deterministic, two runs over the same PacData must produce
// byte-identical EventLog files. The agent demo and worker-isolation
// tests rely on exactly this property.
class EventLog {
public:
    EventLog() = default;
    explicit EventLog(const std::string& path);

    EventLog(const EventLog&)            = delete;
    EventLog& operator=(const EventLog&) = delete;
    EventLog(EventLog&&)                 = default;
    EventLog& operator=(EventLog&&)      = default;

    bool enabled() const noexcept { return out_.is_open(); }

    // Writes `line` followed by a single '\n'. No-op if not enabled.
    void write(const std::string& line);

private:
    std::ofstream out_;
};

} // namespace pac
