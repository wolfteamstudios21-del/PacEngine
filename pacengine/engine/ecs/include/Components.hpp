#pragma once

#include <string>

namespace pac {

// First-class component carrying the original PacData entity id. Every
// entity created from a PacData document gets one of these so systems
// can map back to the source document without leaking PacData types
// into the ECS layer.
struct PacIdComponent {
    std::string pac_id;
};

// Optional companion to PacIdComponent. Set when the PacData EntityDef
// supplies a non-empty `type` (e.g. "agent"). Systems use it to filter
// which entities they care about without hard-coding ids.
struct EntityTypeComponent {
    std::string type;
};

// World-space position. Determinism rules:
//   * x/y/z are doubles, never floats — float NaN/round-off varies
//     across platforms.
//   * Updates only happen inside a registered ISystem (typically
//     MovementSystem). No external mutations during a tick.
//   * Default position is computed deterministically from the entity's
//     pacdata id when PacData does not specify one (see World.cpp).
struct PositionComponent {
    double x = 0.0;
    double y = 0.0;
    double z = 0.0;
};

} // namespace pac
