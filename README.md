PacEngine

Version: 0.0.4PacData Spec: v1.0.0PacCore Spec: v3.0.0

PacEngine is a deterministic simulation engine built as the native runtime for the Pac ecosystem. It executes PacData worlds, runs PacCore v3 logic, scales across workers, and powers advanced simulations like ConflictSim — all with perfect reproducibility.

🧠 Overview

PacEngine is the authoritative runtime for PacData and PacCore. It is designed to run AI-generated and manually authored worlds with deterministic precision. PacEngine focuses on correctness, scalability, and reproducibility — not rendering.

PacEngine forms the runtime backbone for Wolf Team Studios projects, including Realm Unbound, Vanguard, Metro, Collapse, and Street Life.

🔷 Core Concepts

PacData — Unified Simulation Language

PacData defines the schema for all simulation data:

Entities and components

Behavior graphs

GM logic

ConflictSim configurations

Shard definitions

PacEngine consumes PacData exports from PacAI or manual authoring tools, ensuring versioned compatibility and deterministic execution.

PacCore Runtime — Deterministic Execution Engine

PacEngine embeds PacCore v3 logic:

Deterministic tick loop

ECS (Entity Component System)

Scheduler with fixed system ordering

Shard execution and GM logic

ConflictSim — Native Tactical Simulation Module

ConflictSim runs inside PacEngine as a first-class module:

Tactical combat simulation

Faction and morale logic

Terrain and line-of-sight systems

Deterministic resolution per tick

⚙️ Architecture

pacengine/
 ├── engine/
 │    ├── runtime/          # PacRuntime (core loop)
 │    ├── ecs/              # Entity/component system
 │    ├── scheduler/        # System ordering
 │    ├── conflict_sim/     # Tactical simulation module
 │    ├── trace/            # Binary trace + replay
 │    ├── db/               # Internal database
 │    └── worker/           # Worker API for scaling
 ├── pacdata/               # Schema + loaders
 ├── game/                  # Sandbox worlds
 ├── tests/                 # Determinism + isolation tests
 ├── docs/                  # Design + architecture notes

🧪 Proven Chain

PacEngine has been built and proven through deterministic tests:

Loader parses PacData JSON correctly.

ECS materializes entities with PacIdComponent and EntityTypeComponent.

Runtime executes 100-tick loops deterministically.

Scheduler runs ConflictSim as first system.

ConflictSim emits per-tick movement events.

Trace records binary logs alongside event logs.

Determinism and worker isolation tests pass 100%.

Example:

Input — pacengine/examples/agent_world.pacdata.json
{
  "pacdata_version": "1.0.0",
  "paccore_version": "3.0.0",
  "world": {
    "name": "agent_world",
    "entities": [{ "id": 1, "type": "agent" }],
    "conflict_sim": { "enabled": true }
  }
}

Output after 100 ticks — event log:
Tick 1: Agent moved
Tick 2: Agent moved
...
Tick 100: Agent moved

🧩 Determinism Tests

Determinism: Two identical runs produce byte-identical logs and traces.

Worker Isolation: Multiple jobs on the same or new worker yield identical outputs.

ctest summary:
1/4 determinism .............. Passed
2/4 ecs ...................... Passed
3/4 test_agent_demo .......... Passed
4/4 test_worker_isolation .... Passed
100% tests passed

🚀 Roadmap

Version

Milestone

Description

v0.0.5

Trace v2 + Replay v1

Binary trace replay debugger

v0.1.0

Sandbox Visualization

2D tactical map + entity inspector

v0.3.0

PacCore v3 Runtime

Full shard + GM logic integration

v0.5.0

Worker Scaling

Distributed simulation support

v0.7.0

ConflictSim v2

Advanced tactical simulation

v1.0.0

Production Release

Full deterministic runtime for WTS projects

🧩 License

PacEngine © Wolf Team Studios. All rights reserved.

🧠 Contact

For inquiries, collaboration, or licensing: Wolf Team Studios — Virginia, USAFounder: Anthony Grey (Anthony Boyd)Email: contact@wolfteamstudios.com
