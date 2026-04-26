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
  `engine/trace`, `engine/runtime/db`, `engine/runtime/worker`,
  `game/` (sample host), `tests/` (determinism baseline), `examples/`,
  `docs/architecture.md`.

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
  `/pacengine/templates`, `/pacengine/templates/:id/instantiate`, `/pacengine/stats`,
  `/pacengine/engine-info`).
- Backend modules: `artifacts/api-server/src/lib/{pacengine-paths,pacdata-parser,projects-fs,engine-runner,templates}.ts`
  and routes in `artifacts/api-server/src/routes/pacengine.ts`.
- Engine runner spawns `pacengine_game` with `--trace` / `--event-log`, hashes the
  captured artifacts (SHA-256), and computes a tick-by-tick event-log diff for the
  determinism-check endpoint.
