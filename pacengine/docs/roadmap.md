# PacEngine Roadmap

This is not a "feature list." This is a sequenced, dependency‑aware,
risk‑managed roadmap that ensures PacEngine becomes:

- the native deterministic runtime for PacCore v3
- the execution environment for PacAI exports
- the simulation backbone for all WTS games
- the scalable worker unit for PacCore autoscaling
- the foundation for ConflictSim, Vanguard, Realm Unbound, Metro,
  Collapse, Street Life

---

## v0.0.2 — PacData Integration + ConflictSim Stub
**Timeline:** 1–2 weeks
**Goal:** PacEngine stops being a "runtime stub" and becomes a
PacData‑driven executor.

**Deliverables**
- PacData v1.0 schema (entities, world, conflict_sim, versions)
- PacDataLoader (JSON → C++ structs)
- Version validation (`pacdata_version` + `paccore_version`)
- ConflictSim module (stubbed but integrated)
- PacRuntime updated to load PacData
- Determinism test updated to use PacData
- LocalDatabase + WorkerAPI stubs

**Result:** PacEngine can now load real PacAI exports and run them
deterministically.

> Status: shipped in the initial scaffold pass.

---

## v0.0.3 — ECS v1 + Scheduler v1
**Timeline:** 2–3 weeks
**Goal:** Replace placeholder logic with real systems.

**Deliverables**
- Stable EntityId allocator
- Component storage (AoS or SoA)
- Deterministic iteration order
- Scheduler with fixed system ordering
- World built from PacData → ECS

**Result:** PacEngine becomes a real simulation engine, not a loop with
stubs.

---

## v0.0.4 — ConflictSim v1
**Timeline:** 2–3 weeks
**Goal:** First real simulation module.

**Deliverables**
- Factions
- Units
- Basic combat rules
- Movement + engagement logic
- Deterministic resolution
- PacData → ConflictSimConfig mapping

**Result:** PacEngine can run real tactical simulations without PacAI.

---

## v0.0.5 — Trace v2 + Replay v1
**Timeline:** 2 weeks
**Goal:** Deterministic debugging foundation.

**Deliverables**
- Binary trace format v2
- Full world snapshot per tick (compressed)
- Replay mode (deterministic)
- Trace diff tool (CLI)

**Result:** You can debug any simulation by replaying it exactly.

---

## v0.1.0 — Sandbox Game + Debug Visualization
**Timeline:** 4–6 weeks
**Goal:** A visual, interactive testbed.

**Deliverables**
- `/game` sandbox with 100–500 agents
- SDL2/ImGui tactical map (2D)
- Entity inspector
- Step/pause/reset controls
- Hot‑reload PacData

**Result:** PacEngine becomes usable for real development.

---

## v0.2.0 — PacCore v3 Native Runtime
**Timeline:** 6–8 weeks
**Goal:** PacEngine becomes the official PacCore v3 executor.

**Deliverables**
- Shard system
- Deterministic job scheduling
- PacCore v3 GM logic
- PacCore v3 behavior execution
- PacData → PacCore mapping

**Result:** PacEngine can run PacCore v3 worlds natively, without PacAI.

---

## v0.3.0 — Worker Scaling + Internal DB v2
**Timeline:** 4–6 weeks
**Goal:** PacEngine becomes a scalable worker unit.

**Deliverables**
- WorkerJob → PacRuntime integration
- LocalWorker + RemoteWorker
- Snapshot DB (world state every N ticks)
- Trace chunk streaming
- PacCore autoscaling compatibility

**Result:** PacEngine can run thousands of simulations in parallel.

---

## v0.4.0 — Editor v1
**Timeline:** 6–8 weeks
**Goal:** First real editor.

**Deliverables**
- Entity list
- Component inspector
- World graph view
- ConflictSim scenario editor
- PacData editor
- Timeline + replay scrubber

**Result:** PacEngine becomes a developer‑friendly tool, not just a
runtime.

---

## v0.5.0 — Rendering v1 (Optional)
**Timeline:** 8–12 weeks
**Goal:** Minimal 3D visualization (not a full renderer).

**Deliverables**
- BGFX backend
- Simple mesh rendering
- Debug shapes
- Camera controls
- PacData → RenderData converter

**Result:** PacEngine can visualize 3D worlds, but simulation remains
headless.

---

## v0.6.0 — Asset Pipeline v1
**Timeline:** 6–8 weeks
**Goal:** Offline converters for external tools.

**Deliverables**
- Meshy → PacData mesh descriptor
- ElevenLabs → PacData voice descriptor
- Suno → PacData music descriptor
- Texture + animation importers
- Asset registry

**Result:** PacEngine can consume AI‑generated content cleanly.

---

## v0.7.0 — ConflictSim v2
**Timeline:** 6–10 weeks
**Goal:** Full tactical simulation engine.

**Deliverables**
- Morale
- Formations
- Terrain effects
- Line‑of‑sight
- Multi‑faction battles
- PacData scenario scripting

**Result:** ConflictSim becomes a flagship feature of PacEngine.

---

## v0.8.0 — PacAI Integration Layer
**Timeline:** 4–6 weeks
**Goal:** PacEngine becomes the official executor of PacAI exports.

**Deliverables**
- PacAI export validator
- Behavior graph interpreter
- PacAI → PacData → PacEngine pipeline
- Error reporting back to PacAI

**Result:** PacAI and PacEngine become a closed loop.

---

## v0.9.0 — Editor v2 + Tooling
**Timeline:** 8–12 weeks
**Goal:** Production‑ready editor.

**Deliverables**
- Full world editor
- Behavior graph editor
- ConflictSim scenario editor v2
- Asset browser
- Live simulation view
- Replay debugger v2

**Result:** PacEngine becomes a full development environment.

---

## v1.0.0 — Production Release
**Timeline:** 12–18 months total
**Goal:** PacEngine becomes the official deterministic runtime for all
WTS games.

**Deliverables**
- Stable PacData v2.0
- Stable PacCore v3 runtime
- Stable ConflictSim v2
- Stable ECS v2
- Stable editor v2
- Stable worker scaling
- Stable trace/replay
- Stable asset pipeline
- Documentation + SDK

**Result:** PacEngine is ready for:

- Realm Unbound
- Vanguard
- Metro
- Collapse
- Street Life
- Third‑party licensing
- Studio‑wide adoption
