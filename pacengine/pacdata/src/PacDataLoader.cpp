#include "PacDataLoader.hpp"

#include <cctype>
#include <cstddef>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace pac {

namespace {

PacData make_demo_pacdata() {
    PacData data;
    data.version.pacdata = "1.0.0";
    data.version.paccore = "3.0.0";

    data.world.name = "test_world";

    // A small, deterministic entity set so the ECS gets exercised by the
    // demo run and the determinism baseline has something to assert on.
    data.world.entities.push_back(EntityDef{"hero_1", ""});
    data.world.entities.push_back(EntityDef{"hero_2", ""});
    data.world.entities.push_back(EntityDef{"npc_a",  ""});

    data.world.conflict_sim.enabled = true;
    data.world.conflict_sim.scenarios.push_back(ConflictScenario{"scenario_alpha"});

    return data;
}

// ---------------------------------------------------------------------------
// Tiny purpose-built JSON scanner.
//
// PacEngine deliberately avoids pulling in a JSON dependency at this stage.
// The schema we actually parse is small, flat, and well-known, so a hand
// rolled scanner is enough — and stays auditable. The scanner only does
// what the schema needs:
//
//   - locate a top-level string/number/bool value for a given key,
//   - locate the matching {} or [] span for a given key,
//   - split the immediate child {} objects of an array.
//
// String escapes handled: \" \\ \n \t (sufficient for our examples).
// Numbers are returned as their literal text (PacData ids are strings).
// ---------------------------------------------------------------------------

void skip_ws(const std::string& s, std::size_t& i) {
    while (i < s.size() &&
           (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) {
        ++i;
    }
}

// Find the index of the bracket that closes the one at `open_pos`.
// Returns std::string::npos when the document is malformed.
std::size_t find_matching(const std::string& s, std::size_t open_pos) {
    if (open_pos >= s.size()) return std::string::npos;
    const char open  = s[open_pos];
    const char close = (open == '{') ? '}' : ']';
    int  depth  = 0;
    bool in_str = false;
    bool esc    = false;
    for (std::size_t k = open_pos; k < s.size(); ++k) {
        const char c = s[k];
        if (in_str) {
            if (esc)              { esc = false; continue; }
            if (c == '\\')        { esc = true;  continue; }
            if (c == '"')         { in_str = false; }
            continue;
        }
        if (c == '"') { in_str = true; continue; }
        if (c == open)  ++depth;
        else if (c == close) {
            --depth;
            if (depth == 0) return k;
        }
    }
    return std::string::npos;
}

// Returns the position of the first non-whitespace character of the value
// associated with `key` inside the half-open range [start, end), or npos
// when the key is not present at this scope.
std::size_t find_key_value(const std::string& s,
                           const std::string& key,
                           std::size_t start,
                           std::size_t end) {
    const std::string needle = "\"" + key + "\"";
    std::size_t pos = start;
    while (pos < end) {
        const std::size_t found = s.find(needle, pos);
        if (found == std::string::npos || found >= end) {
            return std::string::npos;
        }
        std::size_t after = found + needle.size();
        skip_ws(s, after);
        if (after < end && s[after] == ':') {
            ++after;
            skip_ws(s, after);
            return after;
        }
        pos = found + needle.size();
    }
    return std::string::npos;
}

std::string parse_string_at(const std::string& s, std::size_t i) {
    if (i >= s.size() || s[i] != '"') return "";
    ++i;
    std::string out;
    while (i < s.size() && s[i] != '"') {
        if (s[i] == '\\' && i + 1 < s.size()) {
            ++i;
            switch (s[i]) {
                case 'n':  out += '\n'; break;
                case 't':  out += '\t'; break;
                case '"':  out += '"';  break;
                case '\\': out += '\\'; break;
                default:   out += s[i]; break;
            }
        } else {
            out += s[i];
        }
        ++i;
    }
    return out;
}

// Returns either the parsed string value (when quoted) or the raw number
// literal (when bare). PacData entity ids are exposed as strings either
// way, so a numeric "id": 1 becomes "1".
std::string parse_value_as_string(const std::string& s, std::size_t i) {
    if (i >= s.size()) return "";
    if (s[i] == '"') {
        return parse_string_at(s, i);
    }
    std::string out;
    while (i < s.size() &&
           (std::isdigit(static_cast<unsigned char>(s[i])) ||
            s[i] == '-' || s[i] == '.')) {
        out += s[i++];
    }
    return out;
}

bool parse_bool_at(const std::string& s, std::size_t i, bool def) {
    if (s.compare(i, 4, "true")  == 0) return true;
    if (s.compare(i, 5, "false") == 0) return false;
    return def;
}

struct Span {
    std::size_t open  = std::string::npos;
    std::size_t close = std::string::npos;
    bool valid() const { return open != std::string::npos; }
};

Span find_block(const std::string& s,
                const std::string& key,
                std::size_t start,
                std::size_t end,
                char expected_open) {
    const std::size_t v = find_key_value(s, key, start, end);
    if (v == std::string::npos || v >= end || s[v] != expected_open) {
        return {};
    }
    const std::size_t close = find_matching(s, v);
    if (close == std::string::npos || close > end) {
        return {};
    }
    return {v, close};
}

// Top-level child {} spans inside an array span (open at '[', close at ']').
std::vector<Span> child_object_spans(const std::string& s, Span arr) {
    std::vector<Span> out;
    if (!arr.valid()) return out;
    std::size_t i = arr.open + 1;
    while (i < arr.close) {
        skip_ws(s, i);
        if (i >= arr.close) break;
        if (s[i] == '{') {
            const std::size_t close = find_matching(s, i);
            if (close == std::string::npos || close > arr.close) break;
            out.push_back({i, close});
            i = close + 1;
        } else {
            ++i;
        }
    }
    return out;
}

PacData parse_pacdata(const std::string& text) {
    PacData data;
    const std::size_t end = text.size();

    // Document-level version fields are required.
    const std::size_t pv = find_key_value(text, "pacdata_version", 0, end);
    const std::size_t cv = find_key_value(text, "paccore_version", 0, end);
    if (pv == std::string::npos || cv == std::string::npos) {
        throw std::runtime_error(
            "PacDataLoader: missing pacdata_version / paccore_version");
    }
    data.version.pacdata = parse_string_at(text, pv);
    data.version.paccore = parse_string_at(text, cv);

    const Span world = find_block(text, "world", 0, end, '{');
    if (!world.valid()) {
        throw std::runtime_error("PacDataLoader: missing 'world' block");
    }

    if (const std::size_t v =
            find_key_value(text, "name", world.open, world.close);
        v != std::string::npos) {
        data.world.name = parse_string_at(text, v);
    }

    if (const Span entities =
            find_block(text, "entities", world.open, world.close, '[');
        entities.valid()) {
        for (const Span obj : child_object_spans(text, entities)) {
            EntityDef ed;
            if (const std::size_t v =
                    find_key_value(text, "id", obj.open, obj.close);
                v != std::string::npos) {
                ed.id = parse_value_as_string(text, v);
            }
            if (const std::size_t v =
                    find_key_value(text, "type", obj.open, obj.close);
                v != std::string::npos) {
                ed.type = parse_value_as_string(text, v);
            }
            // Optional position block: { "x": .., "y": .., "z": .. }
            if (const Span pos = find_block(text, "position",
                                            obj.open, obj.close, '{');
                pos.valid()) {
                EntityPosition p;
                if (const std::size_t vx = find_key_value(
                        text, "x", pos.open, pos.close);
                    vx != std::string::npos) {
                    p.x = std::stod(parse_value_as_string(text, vx));
                }
                if (const std::size_t vy = find_key_value(
                        text, "y", pos.open, pos.close);
                    vy != std::string::npos) {
                    p.y = std::stod(parse_value_as_string(text, vy));
                }
                if (const std::size_t vz = find_key_value(
                        text, "z", pos.open, pos.close);
                    vz != std::string::npos) {
                    p.z = std::stod(parse_value_as_string(text, vz));
                }
                ed.position = p;
            }
            data.world.entities.push_back(std::move(ed));
        }
    }

    if (const Span cs =
            find_block(text, "conflict_sim", world.open, world.close, '{');
        cs.valid()) {
        if (const std::size_t v =
                find_key_value(text, "enabled", cs.open, cs.close);
            v != std::string::npos) {
            data.world.conflict_sim.enabled = parse_bool_at(text, v, false);
        }
        if (const Span scenarios =
                find_block(text, "scenarios", cs.open, cs.close, '[');
            scenarios.valid()) {
            for (const Span obj : child_object_spans(text, scenarios)) {
                ConflictScenario sc;
                if (const std::size_t v =
                        find_key_value(text, "id", obj.open, obj.close);
                    v != std::string::npos) {
                    sc.id = parse_value_as_string(text, v);
                }
                data.world.conflict_sim.scenarios.push_back(std::move(sc));
            }
        }
    }

    return data;
}

} // namespace

PacData PacDataLoader::load_from_file(const std::string& path) {
    if (path.empty() || !std::filesystem::exists(path)) {
        // Stub fallback: hand back a fixed PacData so tests and the
        // sample game can run without a file on disk.
        return make_demo_pacdata();
    }

    std::ifstream in(path);
    if (!in) {
        throw std::runtime_error("PacDataLoader: failed to open " + path);
    }

    std::ostringstream buf;
    buf << in.rdbuf();
    return parse_pacdata(buf.str());
}

} // namespace pac
