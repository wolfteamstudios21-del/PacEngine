#pragma once

#include "PacData.hpp"

#include <string>

namespace pac {

class PacDataLoader {
public:
    // Loads a PacData document from disk.
    //
    // For now this is a stub: if the file is missing, or is the well-known
    // demo path, it returns a fixed in-memory PacData useful for tests.
    // Real JSON parsing will replace this once a JSON library is wired in.
    static PacData load_from_file(const std::string& path);
};

} // namespace pac
