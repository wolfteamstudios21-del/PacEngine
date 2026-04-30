#pragma once
// PacSimulation — deterministic tick loop for M3.
//
// Owns all entity simulation state.  PacRenderer (visual) reads entity
// transforms each frame via UpdateSimulationState / GetEntitySnapshot.
// ConflictSim phase transitions are rule-based stubs; full behaviour
// graph is M5 work.
//
// Determinism guarantee: two calls with the same seed + same Tick count
// produce identical entity trajectories.

#include <cstdint>
#include <vector>
#include "../render/core/PacDataWorld.h"

namespace pac::render {

// Lightweight per-entity simulation state (position + velocity).
struct SimEntity {
    uint64_t id = 0;
    PacVec3  position = {};
    PacVec3  velocity = {};  // units/s, seeded from id + world seed

    // ConflictSim phase: 0=idle 1=alert 2=engaged 3=resolving
    int conflictPhase     = 0;
    int ticksInPhase      = 0;

    // Mirror the source data for snapshot reconstruction.
    std::string name;
    std::string faction;
    std::string zone;
    std::string type;
    PacConflictComponent conflict;
};

class PacSimulation {
public:
    PacSimulation();
    ~PacSimulation() = default;

    // Ingest world data; resets tick counter and seeds entity velocities.
    void LoadWorld(const PacDataWorld& world);

    // Advance the simulation by dt seconds (Euler integrator).
    // Safe to call repeatedly; ConflictSim phase advances by rule stubs.
    void Tick(float dt);

    // Return current state as a PacDataWorld so callers don't need to
    // know the internal SimEntity representation.
    PacDataWorld GetEntitySnapshot() const;

    // Elapsed simulation time in seconds since LoadWorld.
    float ElapsedSeconds() const { return m_elapsedSeconds; }

    // Number of Tick() calls since LoadWorld.
    uint64_t TickCount() const { return m_tickCount; }

    // True once LoadWorld has been called.
    bool IsLoaded() const { return m_loaded; }

private:
    // Seed entity velocities deterministically from world.seed + entity id.
    static PacVec3 SeedVelocity(uint64_t worldSeed, uint64_t entityId);

    // Advance ConflictSim phase for one entity (stub rules).
    static int AdvanceConflictPhase(int phase, int ticksInPhase);

    std::vector<SimEntity> m_entities;

    PacDataWorld m_sourceWorld;  // header + non-entity fields
    float        m_elapsedSeconds = 0.f;
    uint64_t     m_tickCount      = 0;
    bool         m_loaded         = false;
};

} // namespace pac::render
