#include "Trace.hpp"

#include "World.hpp"

namespace pac {

Trace::Trace(const std::string& path)
    : path_(path)
    , out_(path, std::ios::binary | std::ios::trunc) {}

Trace::~Trace() = default;

void Trace::record_tick(const World& world, std::uint64_t tick) {
    if (!out_) {
        return;
    }
    // Minimal record: [tick:u64][world_name_size:u32][world_name bytes].
    const auto&         name = world.name();
    const std::uint32_t size = static_cast<std::uint32_t>(name.size());

    out_.write(reinterpret_cast<const char*>(&tick), sizeof(tick));
    out_.write(reinterpret_cast<const char*>(&size), sizeof(size));
    out_.write(name.data(), static_cast<std::streamsize>(size));
    out_.flush();
}

} // namespace pac
