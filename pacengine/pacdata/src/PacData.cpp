#include "PacData.hpp"

#include <stdexcept>

namespace pac {

void validate_versions(const PacDataVersion& v) {
    // Hard-coded for now; later use a real semver compare.
    if (v.pacdata != "1.0.0") {
        throw std::runtime_error("Unsupported PacData version: " + v.pacdata);
    }
    if (v.paccore.rfind("3.", 0) != 0) {
        throw std::runtime_error("Unsupported PacCore version: " + v.paccore);
    }
}

} // namespace pac
