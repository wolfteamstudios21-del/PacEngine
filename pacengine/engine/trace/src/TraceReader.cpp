#include "TraceReader.hpp"

#include "TraceFormat.hpp"

#include <cstring>
#include <fstream>
#include <sstream>
#include <vector>

namespace pac {

namespace {

class Cursor {
public:
    Cursor(const std::uint8_t* data, std::size_t size)
        : data_(data), size_(size) {}

    bool         eof() const noexcept { return pos_ >= size_; }
    std::size_t  pos() const noexcept { return pos_; }
    bool         good() const noexcept { return ok_; }

    bool need(std::size_t n) {
        if (pos_ + n > size_) {
            ok_ = false;
            return false;
        }
        return true;
    }

    std::uint8_t read_u8() {
        if (!need(1)) return 0;
        return data_[pos_++];
    }

    std::uint16_t read_u16() {
        if (!need(2)) return 0;
        const std::uint16_t v = static_cast<std::uint16_t>(data_[pos_]) |
                                (static_cast<std::uint16_t>(data_[pos_ + 1]) << 8);
        pos_ += 2;
        return v;
    }

    std::uint32_t read_u32() {
        if (!need(4)) return 0;
        const std::uint32_t v =  static_cast<std::uint32_t>(data_[pos_]) |
                                (static_cast<std::uint32_t>(data_[pos_ + 1]) << 8) |
                                (static_cast<std::uint32_t>(data_[pos_ + 2]) << 16) |
                                (static_cast<std::uint32_t>(data_[pos_ + 3]) << 24);
        pos_ += 4;
        return v;
    }

    std::uint64_t read_u64() {
        if (!need(8)) return 0;
        std::uint64_t v = 0;
        for (int i = 0; i < 8; ++i) {
            v |= static_cast<std::uint64_t>(data_[pos_ + i]) << (8 * i);
        }
        pos_ += 8;
        return v;
    }

    std::vector<std::uint8_t> read_bytes(std::size_t n) {
        if (!need(n)) return {};
        std::vector<std::uint8_t> out(data_ + pos_, data_ + pos_ + n);
        pos_ += n;
        return out;
    }

    std::string read_string_u32() {
        const std::uint32_t n = read_u32();
        if (!need(n)) return {};
        std::string s(reinterpret_cast<const char*>(data_ + pos_), n);
        pos_ += n;
        return s;
    }

private:
    const std::uint8_t* data_;
    std::size_t         size_;
    std::size_t         pos_ = 0;
    bool                ok_  = true;
};

} // namespace

TraceReader::TraceReader(const std::string& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) {
        error_ = "TraceReader: cannot open " + path;
        return;
    }
    std::ostringstream buf;
    buf << in.rdbuf();
    const std::string  raw    = buf.str();
    const std::uint8_t* data  = reinterpret_cast<const std::uint8_t*>(raw.data());
    Cursor cur(data, raw.size());

    if (!cur.need(trace_format::kHeaderSize)) {
        error_ = "TraceReader: file shorter than v2 header";
        return;
    }
    if (std::memcmp(data, trace_format::kMagic, 4) != 0) {
        error_ = "TraceReader: bad magic (expected PACT)";
        return;
    }
    cur.read_bytes(4); // magic
    version_ = cur.read_u16();
    cur.read_u16(); // flags
    cur.read_u64(); // reserved

    if (version_ != trace_format::kVersionV2) {
        std::ostringstream e;
        e << "TraceReader: unsupported trace version " << version_;
        error_ = e.str();
        return;
    }

    while (!cur.eof()) {
        const std::uint32_t frame_size = cur.read_u32();
        if (!cur.good()) {
            error_ = "TraceReader: truncated frame size";
            return;
        }
        const std::size_t frame_start = cur.pos();
        if (!cur.need(frame_size)) {
            error_ = "TraceReader: frame size exceeds file";
            return;
        }

        TraceFrame frame;
        frame.tick = cur.read_u64();
        const std::uint32_t entity_count = cur.read_u32();
        frame.entities.reserve(entity_count);
        for (std::uint32_t i = 0; i < entity_count && cur.good(); ++i) {
            TraceEntity ent;
            ent.index      = cur.read_u32();
            ent.generation = cur.read_u32();
            const std::uint8_t comp_count = cur.read_u8();
            ent.components.reserve(comp_count);
            for (std::uint8_t c = 0; c < comp_count && cur.good(); ++c) {
                TraceComponent comp;
                comp.type_tag = cur.read_u16();
                const std::uint16_t payload_size = cur.read_u16();
                comp.payload  = cur.read_bytes(payload_size);
                ent.components.push_back(std::move(comp));
            }
            frame.entities.push_back(std::move(ent));
        }
        const std::uint32_t event_count = cur.read_u32();
        frame.events.reserve(event_count);
        for (std::uint32_t i = 0; i < event_count && cur.good(); ++i) {
            frame.events.push_back(cur.read_string_u32());
        }
        if (!cur.good()) {
            error_ = "TraceReader: truncated frame body";
            return;
        }
        if (cur.pos() != frame_start + frame_size) {
            error_ = "TraceReader: frame size mismatch (parser drift)";
            return;
        }
        frames_.push_back(std::move(frame));
    }

    ok_ = true;
}

const TraceFrame* TraceReader::frame_at_tick(std::uint64_t tick) const {
    // Frames are written in monotonically increasing tick order.
    // Linear scan is fine for v1; switch to binary search later.
    for (const auto& f : frames_) {
        if (f.tick == tick) return &f;
    }
    return nullptr;
}

std::optional<std::string>
TraceReader::decode_string(const TraceComponent& c) {
    if (c.payload.size() < 2) return std::nullopt;
    const std::uint16_t n =
        static_cast<std::uint16_t>(c.payload[0]) |
        (static_cast<std::uint16_t>(c.payload[1]) << 8);
    if (c.payload.size() < std::size_t(2 + n)) return std::nullopt;
    return std::string(reinterpret_cast<const char*>(c.payload.data() + 2), n);
}

std::optional<std::tuple<double, double, double>>
TraceReader::decode_position(const TraceComponent& c) {
    if (c.type_tag != trace_format::kPositionTag) return std::nullopt;
    if (c.payload.size() != 24) return std::nullopt;
    auto read_f64 = [&](std::size_t off) {
        std::uint64_t bits = 0;
        for (int i = 0; i < 8; ++i) {
            bits |= static_cast<std::uint64_t>(c.payload[off + i]) << (8 * i);
        }
        double d;
        std::memcpy(&d, &bits, sizeof(d));
        return d;
    };
    return std::make_tuple(read_f64(0), read_f64(8), read_f64(16));
}

} // namespace pac
