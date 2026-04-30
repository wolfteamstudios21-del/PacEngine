#include "PacSimulation.h"

#include <cmath>
#include <cstdio>

namespace pac::render {

// ─── Construction ─────────────────────────────────────────────────────────────

PacSimulation::PacSimulation() = default;

// ─── World loading ────────────────────────────────────────────────────────────

void PacSimulation::LoadWorld(const PacDataWorld& world) {
    m_sourceWorld    = world;
    m_elapsedSeconds = 0.f;
    m_tickCount      = 0;
    m_loaded         = true;

    m_entities.clear();
    m_entities.reserve(world.entities.size());

    for (const auto& ent : world.entities) {
        SimEntity se;
        se.id           = ent.id;
        se.name         = ent.name;
        se.faction      = ent.faction;
        se.zone         = ent.zone;
        se.type         = ent.type;
        se.conflict     = ent.conflict;
        se.position     = ent.transform.position;
        se.velocity     = SeedVelocity(world.seed, ent.id);
        se.conflictPhase  = 0;
        se.ticksInPhase   = 0;
        m_entities.push_back(se);
    }

    std::printf("[PacSimulation] LoadWorld — seed=%llu  entities=%zu\n",
                static_cast<unsigned long long>(world.seed),
                m_entities.size());
}

// ─── Tick ────────────────────────────────────────────────────────────────────

void PacSimulation::Tick(float dt) {
    if (!m_loaded) return;

    for (auto& se : m_entities) {
        // Euler integrator: position += velocity * dt
        se.position.x += se.velocity.x * dt;
        se.position.y += se.velocity.y * dt;
        se.position.z += se.velocity.z * dt;

        // ConflictSim phase transition (rule-based stub)
        se.ticksInPhase++;
        se.conflictPhase = AdvanceConflictPhase(se.conflictPhase, se.ticksInPhase);
        if (se.conflictPhase != AdvanceConflictPhase(se.conflictPhase - 1 < 0 ? 0 : se.conflictPhase - 1,
                                                      se.ticksInPhase - 1)) {
            se.ticksInPhase = 0;
        }
    }

    m_elapsedSeconds += dt;
    ++m_tickCount;
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

PacDataWorld PacSimulation::GetEntitySnapshot() const {
    PacDataWorld snap = m_sourceWorld;
    snap.entities.clear();
    snap.entities.reserve(m_entities.size());

    for (const auto& se : m_entities) {
        PacEntity ent;
        ent.id      = se.id;
        ent.name    = se.name;
        ent.faction = se.faction;
        ent.zone    = se.zone;
        ent.type    = se.type;
        ent.conflict = se.conflict;
        ent.transform.position = se.position;
        ent.transform.scale    = {1.f, 1.f, 1.f};
        // Rotation stays identity — M5 will add orientation from behaviour graph.
        snap.entities.push_back(ent);
    }
    return snap;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Deterministic velocity from world seed + entity id.
// Uses a simple LCG mix so seeds spread nicely in 3D.
PacVec3 PacSimulation::SeedVelocity(uint64_t worldSeed, uint64_t entityId) {
    // LCG constants (Knuth)
    auto lcg = [](uint64_t v) -> uint64_t {
        return v * 6364136223846793005ULL + 1442695040888963407ULL;
    };

    uint64_t h = worldSeed ^ (entityId * 2654435761ULL);
    h = lcg(h);
    const float vx = (static_cast<float>(h & 0xFFFF) / 32767.f) - 1.f; // [-1, 1]
    h = lcg(h);
    const float vy = (static_cast<float>(h & 0xFFFF) / 65535.f) * 0.2f; // [0, 0.2] slight vertical drift
    h = lcg(h);
    const float vz = (static_cast<float>(h & 0xFFFF) / 32767.f) - 1.f;

    // Scale to a modest speed (≈ 1 unit/s max)
    const float speed = 1.f;
    return { vx * speed, vy * speed, vz * speed };
}

// ConflictSim phase stub:
//   idle (0) → alert (1) after 20 ticks
//   alert (1) → engaged (2) after 15 ticks
//   engaged (2) → resolving (3) after 30 ticks
//   resolving (3) → idle (0) after 10 ticks
int PacSimulation::AdvanceConflictPhase(int phase, int ticksInPhase) {
    static constexpr int kPhaseLen[4] = {20, 15, 30, 10};
    const int maxTicks = kPhaseLen[phase & 3];
    if (ticksInPhase >= maxTicks) {
        return (phase + 1) % 4;
    }
    return phase;
}

} // namespace pac::render
