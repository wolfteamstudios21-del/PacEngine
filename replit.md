# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## PacEngine (C++)

A native Pac runtime lives alongside the TS workspace at `pacengine/`. It is a
self-contained CMake project — not a workspace package — and has its own build
and test pipeline.

- **Language**: C++20
- **Build system**: CMake ≥ 3.20
- **System dependency**: `cmake` (Nix)
- **Layout**: `pacdata/` (contract), `engine/runtime`, `engine/conflict_sim`,
  `engine/trace` (Trace v2 writer + reader + diff, format spec in
  `TraceFormat.hpp`), `engine/systems/movement` (deterministic
  PositionComponent updater), `engine/runtime/db`, `engine/runtime/worker`,
  `game/` (sample host), `tests/` (determinism baseline), `examples/`,
  `docs/architecture.md`, `docs/execution-plan.md` (M1–M5 roadmap).

Commands:

- `cd pacengine && cmake -S . -B build` — configure
- `cmake --build pacengine/build -j` — build all targets
- `cd pacengine/build && ctest --output-on-failure` — run the determinism test
- `pacengine/build/game/pacengine_game [pacdata_file] [ticks] [--trace <path>] [--event-log <path>]`
  — run sample host. The `--trace` and `--event-log` flags let an embedding
  process (the editor's api-server) capture deterministic artifacts at
  caller-chosen paths.

## PacEngine Editor (web app)

A UE5-style web editor for PacEngine lives at `artifacts/pacengine-editor` (React + Vite, served at `/`).
The api-server (`artifacts/api-server`) wraps the C++ engine: it reads/writes PacData JSON in
`pacengine/examples/`, spawns `pacengine_game` as a subprocess to capture event logs and
trace artifacts, and exposes a built-in template registry.

- API surface: see `lib/api-spec/openapi.yaml` (`/pacengine/projects`, `/pacengine/projects/import`,
  `/pacengine/projects/:id/runs`, `/pacengine/projects/:id/determinism-check`,
  `/pacengine/runs/:runId`, `/pacengine/runs/:runId/frames`,
  `/pacengine/runs/:runId/diff/:otherRunId`, `/pacengine/templates`,
  `/pacengine/templates/:id/instantiate`, `/pacengine/stats`, `/pacengine/engine-info`).
- Backend modules: `artifacts/api-server/src/lib/{pacengine-paths,pacdata-parser,projects-fs,engine-runner,templates,trace-reader,trace-diff}.ts`
  and routes in `artifacts/api-server/src/routes/pacengine.ts`.
- Engine runner spawns `pacengine_game` with `--trace` / `--event-log`, persists
  trace + events under `pacengine/.editor-runs/<runId>.{trace,events.log,json}`,
  hashes the captured artifacts (SHA-256), and computes a tick-by-tick event-log
  diff for the determinism-check endpoint.
- Trace v2: framed little-endian binary format (magic `PACT`, 16-byte header)
  with per-tick frames carrying entity components (PacId, EntityType,
  PositionComponent) and event lines. The TS reader in
  `artifacts/api-server/src/lib/trace-reader.ts` mirrors `TraceReader.cpp` byte
  for byte; `trace-diff.ts` mirrors `TraceDiff.cpp`.
- Editor (`artifacts/pacengine-editor/src/pages/editor.tsx`) renders a UE5-style
  4-pane layout: outliner, real-position viewport with movement trail,
  details/entity-inspector, and a bottom drawer with Timeline (scrubber + play /
  step / reset), Console, and Determinism (with diff viewer) tabs. Frames are
  fetched in 100-frame windows via `useGetRunFrames`.

The shared `@workspace/api-zod` package exports zod schemas at the package root
and TypeScript types under the `./types/*` subpath (e.g.
`@workspace/api-zod/types/traceFrame`) to avoid name collisions between the
runtime zod values and the generated interfaces.
