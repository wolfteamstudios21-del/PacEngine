#include "PacDataLoader.h"

#include <cstdio>
#include <fstream>
#include <sstream>

#if defined(HAVE_NLOHMANN_JSON)
#include <nlohmann/json.hpp>
using json = nlohmann::json;
#endif

namespace pac::render {

#if defined(HAVE_NLOHMANN_JSON)

// ─── helpers ─────────────────────────────────────────────────────────────────

static PacVec3 ReadVec3(const json& j, const char* key, PacVec3 def = {}) {
    if (!j.contains(key) || !j[key].is_array() || j[key].size() < 3) return def;
    return { j[key][0].get<float>(), j[key][1].get<float>(), j[key][2].get<float>() };
}

template<typename T>
static T GetOr(const json& j, const char* key, T def) {
    return j.contains(key) ? j[key].get<T>() : def;
}

// Normalises entity id: accepts integer OR string representation.
static uint64_t ParseEntityId(const json& jid, uint64_t index) {
    if (jid.is_number_unsigned()) return jid.get<uint64_t>();
    if (jid.is_number())          return static_cast<uint64_t>(jid.get<int64_t>());
    if (jid.is_string()) {
        try { return std::stoull(jid.get<std::string>()); }
        catch (...) {}
    }
    return index; // fallback
}

// ─── entity parser ────────────────────────────────────────────────────────────

static PacEntity ParseEntity(const json& e, uint64_t fallbackIndex) {
    PacEntity ent;
    ent.id      = e.contains("id") ? ParseEntityId(e["id"], fallbackIndex) : fallbackIndex;
    ent.name    = GetOr<std::string>(e, "name", "");
    ent.faction = GetOr<std::string>(e, "faction", "");
    ent.zone    = GetOr<std::string>(e, "zone", "");
    ent.type    = GetOr<std::string>(e, "type", "");

    if (e.contains("tags") && e["tags"].is_object()) {
        for (const auto& [k, v] : e["tags"].items()) {
            if (v.is_string()) ent.tags[k] = v.get<std::string>();
        }
    }

    if (e.contains("components") && e["components"].is_object()) {
        const auto& c = e["components"];
        if (c.contains("transform") && c["transform"].is_object()) {
            const auto& t = c["transform"];
            ent.transform.position = ReadVec3(t, "position");
            ent.transform.scale    = ReadVec3(t, "scale", {1.f, 1.f, 1.f});
            // Quaternion xyzw
            if (t.contains("rotation") && t["rotation"].is_array() && t["rotation"].size() >= 4) {
                ent.transform.rotation = {
                    t["rotation"][0].get<float>(), t["rotation"][1].get<float>(),
                    t["rotation"][2].get<float>(), t["rotation"][3].get<float>()
                };
            }
        }
        if (c.contains("conflict") && c["conflict"].is_object()) {
            const auto& cf = c["conflict"];
            ent.conflict.type     = GetOr<std::string>(cf, "type", "");
            ent.conflict.severity = GetOr<int>(cf, "severity", 1);
        }
    }

    // v7 flat format: transform at entity root (not under components)
    if (!e.contains("components")) {
        if (e.contains("transform") && e["transform"].is_object()) {
            const auto& t = e["transform"];
            ent.transform.position = ReadVec3(t, "position");
            ent.transform.scale    = ReadVec3(t, "scale", {1.f, 1.f, 1.f});
        }
    }
    return ent;
}

// ─── behaviour graph parser ───────────────────────────────────────────────────

static BehaviorGraph ParseBehaviorGraph(const json& g) {
    BehaviorGraph bg;
    bg.id = GetOr<std::string>(g, "id", "");
    if (g.contains("nodes") && g["nodes"].is_array()) {
        for (const auto& n : g["nodes"]) {
            BehaviorGraphNode node;
            node.id   = GetOr<std::string>(n, "id", "");
            node.type = GetOr<std::string>(n, "type", "");
            if (n.contains("params") && n["params"].is_object()) {
                for (const auto& [k, v] : n["params"].items()) {
                    if (v.is_string()) node.params[k] = v.get<std::string>();
                }
            }
            bg.nodes.push_back(std::move(node));
        }
    }
    return bg;
}

// ─── top-level parse ──────────────────────────────────────────────────────────

static bool ParseJson(const json& root, PacDataWorld& out) {
    // Header fields — accept both "format"/"version" (v7) and standard keys.
    out.pacdata_version = root.contains("pacdata_version")
        ? root["pacdata_version"].get<std::string>()
        : root.contains("format")  ? root["format"].get<std::string>()
        : root.contains("version") ? root["version"].get<std::string>() : "";
    out.paccore_version = root.contains("paccore_version")
        ? root["paccore_version"].get<std::string>()
        : root.contains("pacCoreVersion") ? root["pacCoreVersion"].get<std::string>() : "";

    // Find the "world" block — may be a nested object or the root itself (v7).
    const json* world = &root;
    if (root.contains("world") && root["world"].is_object()) world = &root["world"];

    out.name        = GetOr<std::string>(*world, "name", "");
    out.description = GetOr<std::string>(*world, "description", "");
    if (world->contains("seed")) {
        const auto& s = (*world)["seed"];
        out.seed = s.is_number_unsigned() ? s.get<uint64_t>()
                 : s.is_number()          ? static_cast<uint64_t>(s.get<int64_t>())
                 : 0;
    }

    // Entities — accept world.entities or top-level entities (v7 flat).
    const json* entArr = nullptr;
    if (world->contains("entities") && (*world)["entities"].is_array())
        entArr = &(*world)["entities"];
    else if (root.contains("entities") && root["entities"].is_array())
        entArr = &root["entities"];

    if (entArr) {
        out.entities.reserve(entArr->size());
        for (size_t i = 0; i < entArr->size(); ++i)
            out.entities.push_back(ParseEntity((*entArr)[i], i));
    }

    // Behaviour graphs
    if (world->contains("behavior_graphs") && (*world)["behavior_graphs"].is_array())
        for (const auto& g : (*world)["behavior_graphs"])
            out.behaviorGraphs.push_back(ParseBehaviorGraph(g));

    // Shards
    if (world->contains("shards") && (*world)["shards"].is_array()) {
        for (const auto& s : (*world)["shards"]) {
            ShardData sd;
            sd.id       = GetOr<std::string>(s, "id", "");
            sd.type     = GetOr<std::string>(s, "type", "");
            sd.priority = GetOr<int>(s, "priority", 0);
            out.shards.push_back(std::move(sd));
        }
    }

    // Conflict-sim block (accept camelCase alias from v7)
    const json* cs = nullptr;
    if (world->contains("conflict_sim") && (*world)["conflict_sim"].is_object())
        cs = &(*world)["conflict_sim"];
    else if (world->contains("conflictSim") && (*world)["conflictSim"].is_object())
        cs = &(*world)["conflictSim"];
    else if (root.contains("conflictSim") && root["conflictSim"].is_object())
        cs = &root["conflictSim"];
    if (cs) {
        out.conflictSim.enabled = GetOr<bool>(*cs, "enabled", false);
        out.conflictSim.version = GetOr<std::string>(*cs, "version", "");
    }

    // GM logic
    if (world->contains("gm_logic") && (*world)["gm_logic"].is_object()) {
        const auto& gm = (*world)["gm_logic"];
        out.gmLogic.pacing        = GetOr<std::string>(gm, "pacing", "medium");
        out.gmLogic.scenario_type = GetOr<std::string>(gm, "scenario_type", "skirmish");
    }

    return true;
}

#endif // HAVE_NLOHMANN_JSON

// ─── public API ───────────────────────────────────────────────────────────────

bool PacDataLoader::Load(const std::string& filePath, PacDataWorld& out) {
#if defined(HAVE_NLOHMANN_JSON)
    std::ifstream f(filePath);
    if (!f.is_open()) {
        std::fprintf(stderr, "[PacDataLoader] Cannot open: %s\n", filePath.c_str());
        return false;
    }
    std::ostringstream ss;
    ss << f.rdbuf();
    return Parse(ss.str(), out);
#else
    std::fprintf(stderr,
        "[PacDataLoader] nlohmann/json not compiled in "
        "(rebuild with PACENGINE_BUILD_RENDER=ON)\n");
    (void)filePath; (void)out;
    return false;
#endif
}

bool PacDataLoader::Parse(const std::string& jsonStr, PacDataWorld& out) {
#if defined(HAVE_NLOHMANN_JSON)
    try {
        json root = json::parse(jsonStr);
        return ParseJson(root, out);
    } catch (const json::exception& ex) {
        std::fprintf(stderr, "[PacDataLoader] JSON parse error: %s\n", ex.what());
        return false;
    }
#else
    (void)jsonStr; (void)out;
    return false;
#endif
}

} // namespace pac::render
