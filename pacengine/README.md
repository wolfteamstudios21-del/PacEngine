# PacEngine

A native Pac runtime: PacData-driven, ConflictSim built in, worker-shaped
for autoscaling.

## Layout

```
pacengine/
├── CMakeLists.txt
├── engine/
│   ├── runtime/         # PacRuntime (PacCore v3 loop)
│   │   ├── db/          # IDatabase + LocalDatabase
│   │   └── worker/      # WorkerAPI + LocalWorker
│   ├── ecs/             # (planned)
│   ├── scheduler/       # (planned)
│   ├── conflict_sim/    # Native ConflictSim module
│   └── trace/           # Append-only tick trace
├── pacdata/             # PacData schema + loader (the contract)
├── tools/editor/        # (planned)
├── game/                # Sample host (uses LocalWorker)
├── tests/               # Determinism baseline
├── examples/            # Hand-authored PacData
└── docs/architecture.md
```

## Build

Requires CMake ≥ 3.20 and a C++20 compiler.

```bash
cd pacengine
cmake -S . -B build
cmake --build build -j
```

Targets produced:

- `pacengine_pacdata`     — PacData contract library
- `pacengine_runtime`     — PacRuntime + ConflictSim + Trace + DB + Worker
- `pacengine_game`        — sample host driven through `LocalWorker`
- `test_determinism`      — baseline determinism + ConflictSim test

## Run

```bash
# demo PacData (no file -> in-memory demo world with conflict_sim enabled)
./build/game/pacengine_game

# hand-authored PacData
./build/game/pacengine_game examples/test_world.pacdata.json 128
```

## Test

```bash
cd build
ctest --output-on-failure
```

The `determinism` test is the new baseline: it loads PacData, validates
the version pair, runs PacRuntime twice with ConflictSim enabled, and
asserts the two runs produce byte-identical traces.

## Versioning contract

PacEngine refuses to load anything that isn't `pacdata = 1.0.0` and
`paccore = 3.x`. That check lives in `pac::validate_versions` and is
called at the top of `PacRuntime::run()`. Bumping either version is a
deliberate, visible change.

See `docs/architecture.md` for the full module map and the rationale
behind each boundary (PacData, ConflictSim, IDatabase, WorkerAPI).
