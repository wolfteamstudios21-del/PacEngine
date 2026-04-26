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
| `engine/conflict_sim/`        | Native, data-driven ConflictSim module.                    |
| `engine/trace/`               | Append-only tick trace.                                    |
| `engine/ecs/`                 | (planned) Entity / component storage.                      |
| `engine/scheduler/`           | (planned) System scheduler.                                |
| `tools/editor/`               | (planned) PacData / trace editor.                          |
| `game/`                       | Sample host that drives PacEngine via `LocalWorker`.       |
| `tests/`                      | Determinism baseline (PacData + ConflictSim enabled).      |
| `examples/`                   | Hand-authored PacData documents.                           |

## Loop

```
input → gm → simulation (ECS + ConflictSim) → replication → trace / db
```

`PacRuntime::run()` loads PacData, validates the version pair
(`PacData = 1.0.0`, `PacCore = 3.x`), constructs `World`, hands the
`ConflictSimConfig` to a `ConflictSim`, and ticks the loop until
`max_ticks`.

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
