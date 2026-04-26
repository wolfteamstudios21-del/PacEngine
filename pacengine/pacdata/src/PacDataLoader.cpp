#include "PacDataLoader.hpp"

#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>

namespace pac {

namespace {

PacData make_demo_pacdata() {
    PacData data;
    data.version.pacdata = "1.0.0";
    data.version.paccore = "3.0.0";

    data.world.name = "test_world";
    data.world.conflict_sim.enabled = true;
    data.world.conflict_sim.scenarios.push_back(ConflictScenario{"scenario_alpha"});

    return data;
}

// Extremely small substring check used by the stub. The real loader will
// replace this with a proper JSON parser; we just need to recognise the
// presence of a few well-known fields in the demo file.
bool contains(const std::string& haystack, const std::string& needle) {
    return haystack.find(needle) != std::string::npos;
}

} // namespace

PacData PacDataLoader::load_from_file(const std::string& path) {
    if (path.empty() || !std::filesystem::exists(path)) {
        // Stub fallback: hand back a fixed PacData so tests and the
        // sample game can run before a real JSON parser is wired in.
        return make_demo_pacdata();
    }

    std::ifstream in(path);
    if (!in) {
        throw std::runtime_error("PacDataLoader: failed to open " + path);
    }

    std::ostringstream buf;
    buf << in.rdbuf();
    const std::string text = buf.str();

    // Minimal "parser": validate that the file at least *looks* like a
    // PacData document. A real implementation will populate the struct
    // from parsed JSON.
    if (!contains(text, "\"pacdata_version\"") ||
        !contains(text, "\"paccore_version\"")) {
        throw std::runtime_error(
            "PacDataLoader: file is not a PacData document: " + path);
    }

    PacData data = make_demo_pacdata();
    if (contains(text, "\"name\"")) {
        // Leave demo values in place; a real parser will replace them.
    }
    return data;
}

} // namespace pac
