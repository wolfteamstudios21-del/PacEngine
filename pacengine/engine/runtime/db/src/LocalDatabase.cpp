#include "LocalDatabase.hpp"

#include "World.hpp"

#include <filesystem>

namespace pac {

namespace fs = std::filesystem;

LocalDatabase::LocalDatabase(const std::string& dir)
    : dir_(dir) {
    fs::create_directories(dir_);
    state_log_.open(dir_ + "/world_state.log",
                    std::ios::out | std::ios::app);
    trace_log_.open(dir_ + "/trace.bin",
                    std::ios::out | std::ios::binary | std::ios::app);
}

LocalDatabase::~LocalDatabase() = default;

void LocalDatabase::save_world_state(const World& world, std::uint64_t tick) {
    if (!state_log_) {
        return;
    }
    state_log_ << "tick=" << tick
               << " world=" << world.name()
               << '\n';
    state_log_.flush();
}

void LocalDatabase::save_trace_chunk(const void* data, std::size_t size) {
    if (!trace_log_ || data == nullptr || size == 0) {
        return;
    }
    trace_log_.write(static_cast<const char*>(data),
                     static_cast<std::streamsize>(size));
    trace_log_.flush();
}

} // namespace pac
