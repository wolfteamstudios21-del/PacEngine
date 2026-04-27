# PacEngine Execution Plan (v0.0.5 → v0.7)

This doc turns the high-level [`roadmap.md`](roadmap.md) into ordered, dependency-aware,
shippable tasks. Each milestone lists:

- **Why now / unblocks**
- **Current state** (what's actually in the tree today)
- **Tasks**, numbered for selection
- **Done when** (acceptance criteria)
- **Files / modules touched** (C++, OpenAPI, editor)

The five milestones below collapse the long-form roadmap into the labels you used:
**v0.0.5, v0.1, v0.3, v0.5, v0.7**. Internal sub-versions from `roadmap.md`
(v0.2, v0.4, v0.6, v0.8, v0.9) are absorbed into these where appropriate.

---

## Snapshot of where we are today (post-v0.0.4)

- C++ engine builds; `pacengine_game` runs deterministically and now accepts
  `--trace` / `--event-log`.
- ECS, Scheduler, ConflictSim (stub: emits one "Agent moved" line per agent per tick).
- `Trace` v1 records only `[tick:u64][world_name]` per tick — basically nothing.
- `EventLog` is line-oriented text (human-readable, byte-stable across runs).
- `LocalWorker` runs jobs in-process. No remote workers.
- Editor (`artifacts/pacengine-editor`) + api-server (`artifacts/api-server`) are live:
  project browser, editor shell with outliner / viewport / details / console,
  determinism check, template gallery, import-from-PacAI.
- Determinism is verified by `tests/test_determinism.cpp` (must keep passing forever).

---

## M1 — v0.0.5: Trace v2 + Replay v1

**Why now**: every other milestone needs replay (M2 scrubbing, M5 battle review).
The current Trace v1 is so minimal that "replay" is impossible — fixing this
unblocks the entire visual stack.

**Current state**: `engine/trace/Trace.{hpp,cpp}` writes 12 + name bytes per tick.
No reader. No replay path in `PacRuntime`. Editor's timeline drawer doesn't exist.

### Tasks

- **T1.1 — Trace v2 binary format**
  Define a versioned, framed format. Header: `[magic "PACT"][version u16][pacdata_sha256 32B][header_size u32]`.
  Per-tick frame: `[frame_size u32][tick u64][entity_count u32][entities…][event_count u32][events…]`.
  Each entity: `[entity_id u64][generation u32][component_count u8][components…]`.
  Each component: `[type_tag u16][payload_size u16][payload…]`. Type tags include `EntityType`, `Position`, `PacId`, `Faction` (placeholder), etc.
  Files: `engine/trace/include/TraceFormat.hpp` (new).

- **T1.2 — Trace v2 writer**
  Replace `Trace::record_tick` body. Walk `World` component storages in deterministic
  insertion order. Append-only. Fsync at end of run. Keep the v1 path behind a
  `RuntimeConfig::trace_format = V1 | V2` toggle for one release so existing tests
  don't break in the same commit.
  Files: `engine/trace/src/Trace.cpp`.

- **T1.3 — Trace v2 reader + frame index**
  `class TraceReader`: opens a v2 file, walks frames lazily, builds a `vector<uint64_t> frame_offsets` so callers can `seek_to_tick(N)` in O(log n). Validates magic + version + pacdata digest.
  Files: `engine/trace/include/TraceReader.hpp`, `engine/trace/src/TraceReader.cpp` (new).

- **T1.4 — Replay mode in PacRuntime**
  New `RuntimeConfig::replay_path`. When set, `PacRuntime::run` skips all systems and instead drives `World` purely from the trace: each tick = read frame, apply snapshot. Same `Trace` output (sanity check: replay-of-trace produces byte-identical trace).
  Files: `engine/runtime/include/PacRuntime.hpp`, `engine/runtime/src/PacRuntime.cpp`.

- **T1.5 — `pac::trace_diff` library + CLI**
  Library function: `TraceDiff::diff(pathA, pathB) → vector<DiffEntry>` (first differing tick + per-entity diff). CLI: `pacengine_trace_diff a.trace b.trace`.
  Files: `engine/trace/include/TraceDiff.hpp`, `engine/trace/src/TraceDiff.cpp`, `tools/trace_diff/main.cpp` (new).

- **T1.6 — Tests**
  - `test_trace_v2_roundtrip` — write N ticks, read back, frames equal.
  - `test_trace_v2_determinism` — two runs of the same PacData produce byte-identical v2 traces (replaces / supplements existing test).
  - `test_replay` — run produces trace; replay over that trace produces identical world state at every tick.
  - `test_trace_diff` — corrupt one byte, diff finds the right tick.
  Files: `tests/test_trace_v2.cpp` (new).

- **T1.7 — OpenAPI + api-server: trace + replay endpoints**
  - `GET  /pacengine/runs/:runId/trace?from=&to=` — paginated frames (JSON).
  - `POST /pacengine/projects/:id/replay` body `{ traceId | rerun: true, ticks }` → `{ replayId, frameCount }`.
  - `GET  /pacengine/replays/:replayId/frames?from=&to=` — same shape as run trace.
  - Run endpoint persists trace to `pacengine/.editor-runs/<runId>.trace` instead of deleting after hashing, so the editor can scrub it later.
  Files: `lib/api-spec/openapi.yaml`, `artifacts/api-server/src/routes/pacengine.ts`, `artifacts/api-server/src/lib/engine-runner.ts`.

- **T1.8 — Editor: timeline scrubber**
  Bottom drawer gains a "Timeline" tab. Slider 0..N ticks. As user scrubs, fetches frames in a window, shows current tick's events + entity diff vs previous tick.
  Files: `artifacts/pacengine-editor/src/pages/editor.tsx` (or new component).

- **T1.9 — Editor: replay-driven viewport**
  When timeline is active, the viewport renders entities at their snapshot state for the scrubbed tick (not the deterministic hash placement currently used). Adds a "Replay" badge in the toolbar.
  Files: `artifacts/pacengine-editor/src/pages/editor.tsx`.

**Done when**:
- Run a project from the editor → scrub through 100 ticks → see per-tick frames and the entity table change tick by tick.
- `pacengine_trace_diff a.trace b.trace` exits 0 on identical traces, prints a tick offset on mismatch.
- All existing tests still pass; new trace v2 tests pass.

**Effort guess**: ~2 weeks of focused work. Smallest of the five milestones.

---

## M2 — v0.1: Debug Visualization

**Why now**: M1 makes replay possible; M2 makes it useful by giving the
viewport real positions and adding step/pause/reset to the runtime control loop.

**Current state**: viewport places entities by hash of id. ECS has no
`PositionComponent`. Editor only has "Simulate (run N ticks)" — no step.

### Tasks

- **T2.1 — `PositionComponent` (x, y, z float64)**
  Add to `engine/ecs/include/Components.hpp`. Loader populates from `entities[].position` when present in PacData; otherwise computes a deterministic default (same hash the editor uses today, ported to C++). Trace v2 type tag added.
  Files: `engine/ecs/include/Components.hpp`, `pacdata/src/PacDataLoader.cpp`, `engine/runtime/src/World.cpp`.

- **T2.2 — `MovementSystem`**
  New deterministic ISystem. Replaces the placeholder "Agent moved" emit in ConflictSim with actual position mutation (small delta per tick derived from entity id + tick). ConflictSim still emits its log line but now optionally also queries position.
  Files: `engine/systems/movement/{include,src}/MovementSystem.{hpp,cpp}` (new), wire into `PacRuntime`.

- **T2.3 — Step / Pause / Reset in PacRuntime**
  `RuntimeConfig::interactive = true` opens a control fifo or stdin command stream. Commands: `step`, `step N`, `pause`, `reset`, `quit`. Required for the editor to drive the engine interactively without spawning a fresh process per tick.
  Alternative (simpler, recommended): keep `pacengine_game` one-shot, but add `--step-by-step` mode that pauses after each tick and waits for a newline on stdin. The api-server drives stdin from the editor.
  Files: `pacengine/game/main.cpp`, `engine/runtime/src/PacRuntime.cpp`.

- **T2.4 — OpenAPI + api-server: step/pause/reset**
  - `POST /pacengine/projects/:id/runs/step` body `{ runId?, ticks: 1 }` → returns one frame.
  - `POST /pacengine/runs/:runId/pause`
  - `POST /pacengine/runs/:runId/reset`
  - api-server keeps a short-lived `child_process` per active run keyed by `runId`.
  Files: `lib/api-spec/openapi.yaml`, `artifacts/api-server/src/routes/pacengine.ts`, `artifacts/api-server/src/lib/engine-runner.ts` (split into `EngineSession` for stateful runs).

- **T2.5 — Editor: tactical map (real positions)**
  Replace deterministic-hash placement in the viewport with `PositionComponent` from latest frame. Add per-entity trail (last N positions) for movement visualization.
  Files: `artifacts/pacengine-editor/src/pages/editor.tsx`.

- **T2.6 — Editor: entity inspector**
  Click an entity in viewport or outliner → details panel switches from project-level info to per-entity components (id, generation, type, position, faction-when-it-exists). Live-updates during scrubbing.
  Files: `artifacts/pacengine-editor/src/pages/editor.tsx`.

- **T2.7 — Editor: step / pause / reset toolbar buttons**
  Existing "Simulate" button stays. Add: ⏯ Step, ⏸ Pause, ⟲ Reset. Call new endpoints. Console drawer shows commands as they happen.
  Files: `artifacts/pacengine-editor/src/pages/editor.tsx`.

- **T2.8 — Editor: hot-reload PacData**
  api-server watches `pacengine/examples/` (chokidar). Pushes invalidation via SSE or polling. Editor invalidates relevant React Query keys on change. Toast: "agent_world.pacdata.json changed — re-run?"
  Files: `artifacts/api-server/src/routes/pacengine.ts`, `artifacts/pacengine-editor/src/pages/editor.tsx`.

- **T2.9 — Tests**
  - `test_movement_determinism` — two runs produce byte-identical position sequences.
  - `test_step_mode` — step N, pause, step M ⇒ same end-state as one-shot run of (N+M).

**Done when**:
- Click Step, see exactly one tick advance, watch an agent's marker move.
- Open entity inspector, see position update tick by tick.
- Edit a `.pacdata.json` on disk, editor offers to reload.

**Effort guess**: ~3 weeks. Mostly editor work after the engine pieces (T2.1–T2.4) land.

---

## M3 — v0.3: PacCore v3 Runtime (Shards + GM + Behaviors)

**Why now**: This is what makes PacEngine the *PacCore v3* runtime. PacAI exports
have been parseable as PacData since v0.0.2 but their meaningful content (GM
rules, behaviors, shard ownership) has been ignored.

**Current state**: `gm_phase()` and `replication_phase()` are empty stubs.
PacData parses `shards[]` and `gms[]` arrays but they're not wired to anything.

This milestone is large enough that it should ship as **three sub-tasks** that
can each be reviewed and shipped independently.

### M3a — Shards

- **T3a.1 — `ShardId` + `Shard` struct + deterministic assignment** (hash entity id → shard).
- **T3a.2 — `World::for_each_in_shard`** + per-shard iteration order.
- **T3a.3 — Wire `shards[]` from PacData** into a `ShardRegistry` on `World`.
- **T3a.4 — Trace v2 records shard membership** per entity.
- **T3a.5 — Editor: shard overlay toggle** in tactical map.

### M3b — GM Logic

- **T3b.1 — `GMRule` data shape**: `{ id, when: condition_dsl, then: effect_dsl }`. Document a tiny condition DSL (`tick % 10 == 0`, `entity.type == "agent"`, etc).
- **T3b.2 — `GMRuleSet` loaded from PacData `gms[]`**.
- **T3b.3 — `GMSystem`** (ISystem) — evaluates rules each tick, emits to EventLog and trace.
- **T3b.4 — Move evaluation into `PacRuntime::gm_phase`** (replace stub).
- **T3b.5 — Editor: GM rule list in details panel**, fired-this-tick highlights in console.
- **T3b.6 — Tests**: rule fires deterministically; rule with `when: tick % 10 == 0` fires at exactly ticks 0, 10, 20.

### M3c — Behaviors

- **T3c.1 — `BehaviorComponent { behaviorId }`** + `BehaviorRegistry` (map id → tree).
- **T3c.2 — Behavior tree shape**: `{ id, root: node }` with nodes `Sequence | Selector | Action | Condition`. Minimal interpreter.
- **T3c.3 — `BehaviorSystem`** (ISystem) — evaluates per-entity in deterministic id order, emits intents, mutates world.
- **T3c.4 — Editor: behavior viewer in entity inspector** (read-only graph).
- **T3c.5 — Tests**: behavior tree evaluation deterministic; identical PacData ⇒ identical intent stream.

### M3 done when

- A PacAI-shaped export (with shards, GM rules, and behaviors) loads, runs, and the editor shows shard overlay + rules firing + behaviors deciding intents per tick — all replayable.

**Effort guess**: ~6–8 weeks total. Largest milestone.

---

## M4 — v0.5: Worker Scaling

**Why now**: Once PacCore v3 jobs are real (M3), running them at scale becomes
the next bottleneck. M4 turns PacEngine into a unit PacCore can scale.

**Current state**: `LocalWorker::run_job` runs in-process. `WorkerAPI` is just an
interface header. No remote / pool / autoscaling infra.

### Tasks

- **T4.1 — `RemoteWorker`**: implements `WorkerAPI` over HTTP (job in / artifacts out). Sketch the wire format (JSON job, multipart artifact response).
- **T4.2 — `pacengine_worker` standalone binary**: HTTP server (use a tiny embedded HTTP lib — cpp-httplib or similar) that accepts WorkerJob, calls `LocalWorker`, returns artifacts.
- **T4.3 — `WorkerPool` orchestrator** (in PacCore-side, but reference impl lives here): hash-based job → worker assignment, retry on failure, deterministic job ordering across pool size changes.
- **T4.4 — Snapshot DB v2**: `IDatabase::save_snapshot(world, tick)` every K ticks. Replay can fast-forward to nearest snapshot then re-run forward — required for M4 because long traces over a network are expensive.
- **T4.5 — Trace chunk streaming**: worker returns trace as SSE / chunked HTTP; api-server can show the editor live frames as they're produced.
- **T4.6 — Worker autoscaling protocol**: minimal RPC for PacCore to discover workers (registry endpoint), report load, accept job. Documented spec only — implementation is PacCore's job.
- **T4.7 — OpenAPI + api-server: job queue**
  - `POST /pacengine/jobs` body `{ projectId, ticks, workerCount }` → `{ jobId }`.
  - `GET /pacengine/jobs/:jobId` → status + artifacts.
  - `GET /pacengine/jobs/:jobId/stream` (SSE) — live frames.
- **T4.8 — Editor: job queue panel** — see running jobs across workers, click into a job to view its trace.
- **T4.9 — Tests**: 100 jobs across 4 workers produce byte-identical determinism-check artifacts vs 100 sequential local runs.

**Done when**: Editor queues 50 simulations, distributes them across 4 worker processes, all complete with byte-identical results to a sequential baseline.

**Effort guess**: ~5–6 weeks. Lots of infra (HTTP, registries, snapshots).

---

## M5 — v0.7: ConflictSim v2

**Why now**: The flagship simulation feature. Independently demoable. Doesn't
strictly need M3/M4 if you're willing to build it on the v0.0.4 ConflictSim
shape and refactor later — could be reordered ahead of M3.

**Current state**: ConflictSim emits one "Agent moved" line per agent per tick.
No factions, units, combat, terrain, los, or scenario scripting.

### Tasks

- **T5.1 — Faction model** in PacData (`world.factions[]`); `FactionComponent` in ECS.
- **T5.2 — `UnitStatsComponent { hp, max_hp, attack, range, speed, morale }`**.
- **T5.3 — Movement v2 (grid-based pathfinding)**: deterministic A* on integer grid. Replaces M2's MovementSystem for ConflictSim entities.
- **T5.4 — Engagement / damage resolution**: units within range engage; deterministic damage.
- **T5.5 — Morale system**: units retreat when `hp < threshold` or when allies break. Deterministic propagation in id order.
- **T5.6 — Formation logic**: units in a `FormationComponent` share a movement target; cohesion penalty when broken.
- **T5.7 — Terrain effects**: tile types in PacData modify movement / damage / los.
- **T5.8 — Line of sight**: visibility from terrain (Bresenham + tile blockers).
- **T5.9 — Multi-faction battles** (3+).
- **T5.10 — Scenario scripting**: PacData `conflict_sim.scenarios[].script` — a tiny event-driven DSL: "tick 0: spawn faction red at (10,10) formation line; tick 50: faction red attack faction blue".
- **T5.11 — Tests**: 3-faction battle deterministic over 1000 ticks; formation cohesion preserved through movement; morale break reproducible.
- **T5.12 — Editor: battle visualization** — faction colors on the tactical map, hp bars, range circles, terrain overlay, los polygon, scenario step list with fired-this-tick highlights.

**Done when**: ConflictSim Showcase template runs a 3-champion brawl with morale, formations, and terrain effects, fully replayable in the editor.

**Effort guess**: ~6–8 weeks. Cleanly separable into combat (T5.1–T5.5), tactics (T5.6–T5.9), and scripting (T5.10) sub-shipments.

---

## Cross-cutting rules (apply to every milestone)

1. **`tests/test_determinism.cpp` must keep passing forever**. New tests are added beside it; the existing one is never deleted.
2. **Every new engine concept needs an editor surface** before the milestone ships. If the user can't see it in the editor, it doesn't exist.
3. **OpenAPI is the contract**: every editor feature starts with a spec change → `pnpm --filter @workspace/api-spec codegen` → backend → frontend.
4. **Versioning discipline**: bump `pacdata_version` only when the on-disk format changes incompatibly. Bump `paccore_version` when behavior changes break replay across releases.
5. **No silent fallbacks**: if the engine binary is missing, replay data is corrupt, or a worker is unreachable, the editor must surface a clear error — never quietly degrade.

---

## Suggested ship order

| # | Milestone | Why this slot | Rough effort |
|---|-----------|---------------|--------------|
| 1 | **M1 — v0.0.5** Trace v2 + Replay v1 | Smallest. Unblocks every visual milestone. Current Trace v1 is barely functional. | ~2 weeks |
| 2 | **M2 — v0.1** Debug Viz | Tiny on top of M1. Makes the editor genuinely useful. | ~3 weeks |
| 3 | **M5 — v0.7** ConflictSim v2 | Out-of-roadmap-order, but it's the most demoable feature and doesn't strictly need M3/M4 to be impressive. | ~6–8 weeks |
| 4 | **M3 — v0.3** PacCore v3 Runtime | Internal heavy lift. Three sub-shipments (M3a/b/c). | ~6–8 weeks |
| 5 | **M4 — v0.5** Worker Scaling | Infra-heavy; benefits from a stable runtime. | ~5–6 weeks |

Total: roughly 5–6 months end-to-end if shipped sequentially.

Pick a milestone (or a sub-task within one) and I'll start.
