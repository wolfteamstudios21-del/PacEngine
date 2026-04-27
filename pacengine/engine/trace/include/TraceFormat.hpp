#pragma once

#include <cstdint>

namespace pac::trace_format {

// Trace v2 — framed, deterministic, little-endian.
//
// Format:
//   Header (16 bytes):
//     magic    : "PACT"      (4 bytes, char)
//     version  : u16 = 2     (2 bytes)
//     flags    : u16 = 0     (2 bytes)
//     reserved : u64 = 0     (8 bytes)
//
//   Then a sequence of frames, append-only:
//     frame_size      : u32 (size of frame *excluding* this u32)
//     tick            : u64
//     entity_count    : u32
//     for each entity:
//       index         : u32
//       generation    : u32
//       component_count : u8
//       for each component:
//         type_tag    : u16
//         payload_size: u16
//         payload     : bytes (per-tag layout)
//     event_count     : u32
//     for each event:
//       string_size   : u32
//       string bytes
//
// Per-tag payload layouts:
//   kPacIdTag       : u16 size + bytes
//   kEntityTypeTag  : u16 size + bytes
//   kPositionTag    : 24 bytes (3x f64 little-endian: x, y, z)
//
// Endianness is little-endian on disk regardless of host. We control
// both writer and reader, so we serialize everything explicitly via
// memcpy + byte-shuffle helpers — no host-byte-order surprises.

inline constexpr char     kMagic[4]      = {'P','A','C','T'};
inline constexpr std::uint16_t kVersionV2 = 2;

inline constexpr std::size_t kHeaderSize = 16;

// Component type tags. Stable wire identifiers — never reuse a number
// for a different shape. New components get a new number.
inline constexpr std::uint16_t kPacIdTag      = 1;
inline constexpr std::uint16_t kEntityTypeTag = 2;
inline constexpr std::uint16_t kPositionTag   = 3;

} // namespace pac::trace_format
