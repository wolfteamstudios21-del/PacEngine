#pragma once

#include "IDatabase.hpp"

#include <fstream>
#include <string>

namespace pac {

// File-backed implementation of IDatabase. Writes a per-tick line into a
// state log and appends raw trace chunks into a sibling file. Good enough
// to validate the PacEngine ↔ storage contract; PacCore swaps in a real
// service later.
class LocalDatabase final : public IDatabase {
public:
    explicit LocalDatabase(const std::string& dir);
    ~LocalDatabase() override;

    LocalDatabase(const LocalDatabase&)            = delete;
    LocalDatabase& operator=(const LocalDatabase&) = delete;

    void save_world_state(const World& world, std::uint64_t tick) override;
    void save_trace_chunk(const void* data, std::size_t size) override;

    const std::string& dir() const noexcept { return dir_; }

private:
    std::string   dir_;
    std::ofstream state_log_;
    std::ofstream trace_log_;
};

} // namespace pac
