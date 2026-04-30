// test_simulation_determinism.cpp
//
// Verifies that PacSimulation is deterministic:
//   1. Two independent runs from the same seed produce identical entity positions.
//   2. Final positions match a pre-computed golden snapshot — catches any change
//      to the integrator or velocity-seeding algorithm.
//
// Golden values were computed by running make_test_world(0xDEADBEEF42, 8) for
// 100 ticks at dt=1/20 and recording entity[0].transform.position.

#include "PacSimulation.h"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <string>
#include <vector>

namespace {

pac::render::PacDataWorld make_test_world(uint64_t seed, std::size_t entity_count) {
    pac::render::PacDataWorld world;
    world.pacdata_version = "1.1.0";
    world.paccore_version = "3.0.0";
    world.name            = "test_world";
    world.seed            = seed;
    world.description     = "determinism test world";

    for (std::size_t i = 0; i < entity_count; ++i) {
        pac::render::PacEntity ent;
        ent.id      = static_cast<uint64_t>(i + 1);
        ent.name    = "agent_" + std::to_string(i);
        ent.faction = (i % 2 == 0) ? "alpha" : "beta";
        ent.zone    = "arena";
        ent.type    = "npc_agent";
        ent.transform.position = { static_cast<float>(i) * 0.5f, 0.f, static_cast<float>(i) * 0.5f };
        ent.transform.scale    = { 1.f, 1.f, 1.f };
        ent.transform.rotation = { 0.f, 0.f, 0.f, 1.f };
        world.entities.push_back(ent);
    }
    return world;
}

struct Vec3Snapshot {
    float x, y, z;
    bool operator==(const Vec3Snapshot& o) const {
        return x == o.x && y == o.y && z == o.z;
    }
};

int fail(const std::string& msg) {
    std::cerr << "[sim_determinism] FAIL: " << msg << '\n';
    return 1;
}

// Tolerance for golden comparison (exact IEEE-754 match expected; ULP=0).
static bool floats_eq(float a, float b) { return a == b; }

} // namespace

int main() {
    constexpr std::size_t kEntityCount = 8;
    constexpr uint64_t    kSeed        = 0xDEADBEEF42ULL;
    constexpr std::size_t kTicks       = 100;
    constexpr float       kDt          = 1.f / 20.f; // 20 Hz

    const pac::render::PacDataWorld world = make_test_world(kSeed, kEntityCount);

    // ── Run A ─────────────────────────────────────────────────────────────────
    std::vector<Vec3Snapshot> posA;
    {
        pac::render::PacSimulation sim;
        sim.LoadWorld(world);
        for (std::size_t t = 0; t < kTicks; ++t) sim.Tick(kDt);

        const pac::render::PacDataWorld snap = sim.GetEntitySnapshot();
        posA.reserve(snap.entities.size());
        for (const auto& ent : snap.entities)
            posA.push_back({ ent.transform.position.x,
                             ent.transform.position.y,
                             ent.transform.position.z });

        if (sim.TickCount() != kTicks)
            return fail("run A tick count mismatch: got " + std::to_string(sim.TickCount()));
    }

    // ── Run B — fresh object, same inputs ─────────────────────────────────────
    std::vector<Vec3Snapshot> posB;
    {
        pac::render::PacSimulation sim;
        sim.LoadWorld(world);
        for (std::size_t t = 0; t < kTicks; ++t) sim.Tick(kDt);

        const pac::render::PacDataWorld snap = sim.GetEntitySnapshot();
        posB.reserve(snap.entities.size());
        for (const auto& ent : snap.entities)
            posB.push_back({ ent.transform.position.x,
                             ent.transform.position.y,
                             ent.transform.position.z });
    }

    // ── Check 1: run A == run B ───────────────────────────────────────────────
    if (posA.size() != kEntityCount)
        return fail("run A entity count wrong: " + std::to_string(posA.size()));
    if (posA.size() != posB.size())
        return fail("snapshot sizes differ between runs");

    for (std::size_t i = 0; i < posA.size(); ++i) {
        if (!(posA[i] == posB[i])) {
            return fail("entity " + std::to_string(i)
                + " positions diverged A≠B:"
                + " A=(" + std::to_string(posA[i].x) + "," + std::to_string(posA[i].y) + "," + std::to_string(posA[i].z) + ")"
                + " B=(" + std::to_string(posB[i].x) + "," + std::to_string(posB[i].y) + "," + std::to_string(posB[i].z) + ")");
        }
    }

    // ── Check 2: golden snapshot for entity[0] ────────────────────────────────
    // Golden values computed from seed=0xDEADBEEF42, entity id=1, 100 ticks at dt=1/20.
    // Hex float literals guarantee exact IEEE-754 bit-for-bit comparison.
    // Any change to SeedVelocity or Tick must regenerate these constants.
    constexpr float kGoldenX = 0x1.cc8fb4p-1f;   // ≈  0.89953
    constexpr float kGoldenY = 0x1.d741fap-6f;   // ≈  0.02876
    constexpr float kGoldenZ = 0x1.1728c2p+2f;   // ≈  4.36186

    if (!floats_eq(posA[0].x, kGoldenX) ||
        !floats_eq(posA[0].y, kGoldenY) ||
        !floats_eq(posA[0].z, kGoldenZ)) {
        return fail("entity[0] golden snapshot mismatch:"
            " got (" + std::to_string(posA[0].x)
            + "," + std::to_string(posA[0].y)
            + "," + std::to_string(posA[0].z) + ")"
            + " want (" + std::to_string(kGoldenX)
            + "," + std::to_string(kGoldenY)
            + "," + std::to_string(kGoldenZ) + ")");
    }

    // ── Check 3: entities actually moved ─────────────────────────────────────
    bool anyMoved = false;
    for (std::size_t i = 0; i < posA.size(); ++i) {
        const auto& orig = world.entities[i].transform.position;
        if (posA[i].x != orig.x || posA[i].z != orig.z)
            anyMoved = true;
    }
    if (!anyMoved)
        return fail("no entities moved — Euler integrator may be broken");

    std::printf("[sim_determinism] OK — seed=%llu  entities=%zu  ticks=%zu  "
                "run-A==run-B  golden[0]=(%.6f,%.6f,%.6f)\n",
                static_cast<unsigned long long>(kSeed),
                kEntityCount,
                kTicks,
                posA[0].x, posA[0].y, posA[0].z);
    return 0;
}
