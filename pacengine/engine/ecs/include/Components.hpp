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

} // namespace pac
