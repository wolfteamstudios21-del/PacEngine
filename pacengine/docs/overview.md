# PacEngine — Deterministic Runtime for the Pac Ecosystem

PacEngine is a headless, deterministic simulation engine designed to run
PacData worlds, PacCore v3 logic, and ConflictSim scenarios with perfect
reproducibility. It is the authoritative execution environment for all
PacAI‑generated content and the scalable worker unit for PacCore’s
distributed simulation framework.

PacEngine is **not** a renderer-first engine. It is a simulation-first
engine built around:

- deterministic tick execution
- strict data-driven architecture
- reproducible state transitions
- scalable worker orchestration
- modular runtime systems
- trace + replay debugging
- shard-aware world simulation

PacEngine forms the runtime heart of Wolf Team Studios’ entire ecosystem.

---

## Core Pillars

### 1. PacData‑Driven Architecture

PacEngine consumes **PacData**, a versioned schema defining:

- entities
- components
- behavior graphs
- GM logic
- conflict simulation configs
- shard definitions
- world metadata

PacEngine does not depend on PacAI. It depends only on PacData, ensuring
clean separation between tools and runtime.

### 2. Native PacCore v3 Runtime

PacEngine embeds the full PacCore v3 execution model:

- deterministic tick loop
- ECS v1
- scheduler v1
- shard execution
- GM logic
- behavior evaluation
- world state transitions

This makes PacEngine the official PacCore executor, capable of running
worlds without PacAI or external tools.

### 3. Built‑In ConflictSim Module

ConflictSim is a native runtime module providing:

- tactical combat simulation
- faction logic
- engagement rules
- morale and formations (v2)
- terrain and LOS (v2)

It is fully data-driven through PacData and runs deterministically inside
the main tick loop.

### 4. Deterministic Execution

PacEngine guarantees:

- same input → same output
- stable iteration order
- fixed-point or deterministic math
- binary trace logs
- replayable simulations

This is essential for:

- debugging
- multiplayer
- worker scaling
- AI training
- reproducible world states

### 5. Worker Scaling + Internal DB

PacEngine includes:

- **WorkerAPI** (job execution interface)
- **WorkerJob** (PacData + tick count)
- **LocalWorker** (single-machine)
- **RemoteWorker** (PacCore autoscaling)
- **Internal DB** (snapshots + trace chunks)

This allows PacEngine to run:

- locally
- in CI
- in PacCore clusters
- in Fly.io autoscaling environments

PacEngine is designed to run thousands of simulations in parallel.

### 6. Trace + Replay System

PacEngine records:

- world snapshots
- tick-by-tick state changes
- deterministic trace logs

Replay mode allows:

- debugging
- regression testing
- AI evaluation
- deterministic reproduction of bugs

### 7. Modular Runtime Systems

PacEngine is built from independent modules:

- runtime
- ECS
- scheduler
- conflict_sim
- trace
- db
- worker

Each module is isolated, testable, and replaceable.

### 8. Optional Visualization + Editor

PacEngine is headless by default, but supports:

- 2D debug visualization
- optional 3D rendering (BGFX)
- PacEditor (world inspector + replay debugger)

Visualization never affects simulation determinism.

---

## ⭐ Ecosystem (PacAI + PacCore + PacEngine)

PacEngine is the execution layer of the Pac ecosystem.

**PacAI → PacData → PacEngine → PacCore Scaling**

- **PacAI** generates PacData (worlds, behaviors, conflict scenarios).
- **PacEngine** executes PacData deterministically.
- **PacCore** scales PacEngine workers across machines.

This creates a closed-loop ecosystem where:

- AI generates content
- PacEngine runs it
- PacCore scales it
- Designers iterate on it
- PacAI learns from it

PacEngine is the runtime heart of this loop.
