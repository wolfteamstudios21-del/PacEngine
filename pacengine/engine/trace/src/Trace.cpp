#include "Trace.hpp"

#include "Components.hpp"
#include "TraceFormat.hpp"
#include "World.hpp"

#include <cstdint>
#include <cstring>
#include <vector>

namespace pac {

namespace {

// Little-endian byte writers. We intentionally do not memcpy host
// integers because the host might be big-endian.
void put_u16(std::vector<std::uint8_t>& out, std::uint16_t v) {
    out.push_back(static_cast<std::uint8_t>( v        & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((v >>  8) & 0xFFu));
}

void put_u32(std::vector<std::uint8_t>& out, std::uint32_t v) {
    out.push_back(static_cast<std::uint8_t>( v        & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((v >>  8) & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((v >> 16) & 0xFFu));
    out.push_back(static_cast<std::uint8_t>((v >> 24) & 0xFFu));
}

void put_u64(std::vector<std::uint8_t>& out, std::uint64_t v) {
    for (int i = 0; i < 8; ++i) {
        out.push_back(static_cast<std::uint8_t>((v >> (8 * i)) & 0xFFu));
    }
}

void put_f64(std::vector<std::uint8_t>& out, double v) {
    std::uint64_t bits = 0;
    static_assert(sizeof(bits) == sizeof(v), "double must be 8 bytes");
    std::memcpy(&bits, &v, sizeof(bits));
    put_u64(out, bits);
}

void put_string_u16(std::vector<std::uint8_t>& out, const std::string& s) {
    const std::uint16_t n = static_cast<std::uint16_t>(s.size());
    put_u16(out, n);
    out.insert(out.end(), s.begin(), s.end());
}

void put_string_u32(std::vector<std::uint8_t>& out, const std::string& s) {
    const std::uint32_t n = static_cast<std::uint32_t>(s.size());
    put_u32(out, n);
    out.insert(out.end(), s.begin(), s.end());
}

} // namespace

Trace::Trace(const std::string& path)
    : path_(path)
    , out_(path, std::ios::binary | std::ios::trunc) {
    write_header();
}

Trace::~Trace() = default;

void Trace::write_header() {
    if (!out_) return;
    std::vector<std::uint8_t> header;
    header.reserve(trace_format::kHeaderSize);
    header.insert(header.end(), trace_format::kMagic,
                  trace_format::kMagic + 4);
    put_u16(header, trace_format::kVersionV2);
    put_u16(header, 0); // flags
    put_u64(header, 0); // reserved
    out_.write(reinterpret_cast<const char*>(header.data()),
               static_cast<std::streamsize>(header.size()));
}

void Trace::push_event(const std::string& line) {
    pending_events_.push_back(line);
}

void Trace::record_tick(const World& world, std::uint64_t tick) {
    if (!out_) {
        return;
    }

    // Build the frame body in memory first so we can prepend frame_size.
    std::vector<std::uint8_t> body;
    body.reserve(256);
    put_u64(body, tick);

    // Walk entities in PacIdComponent insertion order. PacIdComponent is
    // assigned to *every* entity in World construction in document order
    // so this gives us the stable, deterministic entity iteration order.
    std::vector<EntityId> ordered;
    world.for_each<PacIdComponent>(
        [&](EntityId e, const PacIdComponent&) { ordered.push_back(e); });

    put_u32(body, static_cast<std::uint32_t>(ordered.size()));

    for (const EntityId e : ordered) {
        put_u32(body, e.index);
        put_u32(body, e.generation);

        // Build component sub-records first so we know the count.
        std::vector<std::pair<std::uint16_t, std::vector<std::uint8_t>>> comps;

        if (const auto* p = world.get_component<PacIdComponent>(e); p) {
            std::vector<std::uint8_t> payload;
            put_string_u16(payload, p->pac_id);
            comps.emplace_back(trace_format::kPacIdTag, std::move(payload));
        }
        if (const auto* t = world.get_component<EntityTypeComponent>(e); t) {
            std::vector<std::uint8_t> payload;
            put_string_u16(payload, t->type);
            comps.emplace_back(trace_format::kEntityTypeTag, std::move(payload));
        }
        if (const auto* pos = world.get_component<PositionComponent>(e); pos) {
            std::vector<std::uint8_t> payload;
            payload.reserve(24);
            put_f64(payload, pos->x);
            put_f64(payload, pos->y);
            put_f64(payload, pos->z);
            comps.emplace_back(trace_format::kPositionTag, std::move(payload));
        }

        body.push_back(static_cast<std::uint8_t>(comps.size()));
        for (auto& [tag, payload] : comps) {
            put_u16(body, tag);
            put_u16(body, static_cast<std::uint16_t>(payload.size()));
            body.insert(body.end(), payload.begin(), payload.end());
        }
    }

    put_u32(body, static_cast<std::uint32_t>(pending_events_.size()));
    for (const auto& line : pending_events_) {
        put_string_u32(body, line);
    }
    pending_events_.clear();

    // Frame prefix: size of the body that follows.
    std::vector<std::uint8_t> prefix;
    put_u32(prefix, static_cast<std::uint32_t>(body.size()));

    out_.write(reinterpret_cast<const char*>(prefix.data()),
               static_cast<std::streamsize>(prefix.size()));
    out_.write(reinterpret_cast<const char*>(body.data()),
               static_cast<std::streamsize>(body.size()));
    out_.flush();
}

} // namespace pac
