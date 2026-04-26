# PacEngine Architecture

PacEngine is a **native Pac runtime**, not just a generic engine. It only
understands PacData, runs ConflictSim as a first-class native module, and
exposes its scaling unit through a worker boundary.

## Module map

| Path                          | Role                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `pacdata/`                    | PacData schema + loader (the contract layer).              |
| `engine/runtime/`             | `PacRuntime` — the PacCore v3 loop.                        |
| `engine/runtime/db/`          | `IDatabase` abstraction + `LocalDatabase` reference impl.  |
| `engine/runtime/worker/`      | `WorkerAPI` + `WorkerJob` + `LocalWorker`.                 |
| `engine/conflict_sim/`        | Native, data-driven ConflictSim module (also an `ISystem`). |
| `engine/trace/`               | Append-only tick trace.                                    |
| `engine/ecs/`                 | `EntityId`, `ComponentStorage<T>`, built-in components.    |
| `engine/scheduler/`           | `ISystem` + fixed-order `Scheduler`.                       |
| `tools/editor/`               | (planned) PacData / trace editor.                          |
| `game/`                       | Sample host that drives PacEngine via `LocalWorker`.       |
| `tests/`                      | Determinism baseline (PacData + ConflictSim enabled).      |
| `examples/`                   | Hand-authored PacData documents.                           |

## Loop

```
input → gm → simulation (Scheduler → systems incl. ConflictSim) → replication → trace / db
```

`PacRuntime::run()` loads PacData, validates the version pair
(`PacData = 1.0.0`, `PacCore = 3.x`), constructs `World` (which
materializes one ECS entity per `EntityDef` from PacData and tags it
with a `PacIdComponent`), builds a `Scheduler` and registers
`ConflictSim` as the first system, then ticks the loop until
`max_ticks`.

## ECS + Scheduler (v0.0.3)

- `EntityId` is `{index, generation}`. Slots are recycled LIFO from a
  free list; `destroy_entity` bumps the slot's generation so any stale
  EntityId held over a destroy/create boundary fails `is_alive`.
- `ComponentStorage<T>` keeps a dense `vector<T>` plus a parallel
  `vector<EntityId>` and an `unordered_map` index. Iteration order is
  insertion order, which is what makes `for_each<T>` deterministic
  regardless of platform or hash seed.
- The `Scheduler` is intentionally simple: systems run in the exact
  order they were added, every tick, every run. There is no
  parallelism, no ordering hints, no dependency graph in v1 —
  determinism is the headline property.
- `ConflictSim` is the first concrete `ISystem`; future modules
  (movement, GM eval, etc.) plug in the same way.

## Versioning contract

`pac::validate_versions` is the single chokepoint that keeps PacAI exports
and PacEngine honest. It runs at load time inside `PacRuntime::run()` and
inside `test_determinism`. Bumping either version is a deliberate, visible
change.

## Determinism baseline

`tests/test_determinism.cpp` is the new baseline:

1. Demo PacData has `conflict_sim.enabled = true`.
2. `ConflictSim` reports `enabled()` after construction.
3. Two `PacRuntime` runs of the same job produce **byte-identical** traces.
4. `LocalWorker.run_job` drives the same job end-to-end and exits 0.

Any future change to runtime / ECS / scheduler / ConflictSim must keep
this passing.
