#include "TraceDiff.hpp"

#include "TraceReader.hpp"

#include <algorithm>
#include <sstream>

namespace pac {

namespace {

void note(TraceDiffResult& out,
          std::uint64_t tick,
          const std::string& kind,
          const std::string& detail,
          std::size_t max_entries) {
    out.identical = false;
    if (!out.first_divergence_tick.has_value()) {
        out.first_divergence_tick = tick;
    }
    if (out.entries.size() < max_entries) {
        out.entries.push_back({tick, kind, detail});
    }
}

bool components_equal(const TraceEntity& a, const TraceEntity& b) {
    if (a.components.size() != b.components.size()) return false;
    for (std::size_t i = 0; i < a.components.size(); ++i) {
        if (a.components[i].type_tag != b.components[i].type_tag) return false;
        if (a.components[i].payload  != b.components[i].payload)  return false;
    }
    return true;
}

} // namespace

TraceDiffResult TraceDiff::diff(const std::string& path_a,
                                const std::string& path_b,
                                std::size_t max_entries) {
    TraceDiffResult out;

    TraceReader ra(path_a);
    TraceReader rb(path_b);
    if (!ra.ok()) {
        note(out, 0, "frame_size_diff",
             "trace A failed to load: " + ra.error(), max_entries);
        return out;
    }
    if (!rb.ok()) {
        note(out, 0, "frame_size_diff",
             "trace B failed to load: " + rb.error(), max_entries);
        return out;
    }

    const auto& fa = ra.frames();
    const auto& fb = rb.frames();
    const std::size_t common = std::min(fa.size(), fb.size());

    for (std::size_t i = 0; i < common; ++i) {
        const TraceFrame& a = fa[i];
        const TraceFrame& b = fb[i];

        if (a.tick != b.tick) {
            std::ostringstream d;
            d << "tick mismatch: A=" << a.tick << " B=" << b.tick;
            note(out, a.tick, "frame_size_diff", d.str(), max_entries);
            continue;
        }

        // Entity-level diff. Match by (index, generation) — same key the
        // writer uses, so this is the deterministic identity comparison.
        // Entities are written in stable document order, so we can walk
        // both lists in lock-step.
        const std::size_t ne = std::min(a.entities.size(), b.entities.size());
        for (std::size_t e = 0; e < ne; ++e) {
            const auto& ea = a.entities[e];
            const auto& eb = b.entities[e];
            if (ea.index != eb.index || ea.generation != eb.generation) {
                std::ostringstream d;
                d << "entity slot " << e << " identity differs (A="
                  << ea.index << "/" << ea.generation
                  << " B=" << eb.index << "/" << eb.generation << ")";
                note(out, a.tick, "entity_changed", d.str(), max_entries);
                continue;
            }
            if (!components_equal(ea, eb)) {
                std::ostringstream d;
                d << "entity " << ea.index << " components differ";
                note(out, a.tick, "entity_changed", d.str(), max_entries);
            }
        }
        for (std::size_t e = ne; e < a.entities.size(); ++e) {
            std::ostringstream d;
            d << "entity " << a.entities[e].index << " present in A only";
            note(out, a.tick, "entity_removed", d.str(), max_entries);
        }
        for (std::size_t e = ne; e < b.entities.size(); ++e) {
            std::ostringstream d;
            d << "entity " << b.entities[e].index << " present in B only";
            note(out, a.tick, "entity_added", d.str(), max_entries);
        }

        // Events. Compare in order; mismatch ⇒ event_diff.
        const std::size_t ev = std::min(a.events.size(), b.events.size());
        for (std::size_t k = 0; k < ev; ++k) {
            if (a.events[k] != b.events[k]) {
                std::ostringstream d;
                d << "event " << k << " differs: A='" << a.events[k]
                  << "' B='" << b.events[k] << "'";
                note(out, a.tick, "event_diff", d.str(), max_entries);
            }
        }
        if (a.events.size() != b.events.size()) {
            std::ostringstream d;
            d << "event count differs: A=" << a.events.size()
              << " B=" << b.events.size();
            note(out, a.tick, "event_diff", d.str(), max_entries);
        }
    }

    if (fa.size() != fb.size()) {
        std::ostringstream d;
        d << "frame count differs: A=" << fa.size() << " B=" << fb.size();
        note(out, common, "frame_size_diff", d.str(), max_entries);
    }

    return out;
}

} // namespace pac
