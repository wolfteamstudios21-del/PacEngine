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

## Required Environment Secrets

The following secrets must be configured (Replit Secrets) before the API server starts:

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto-provisioned by Replit) |
| `JWT_SECRET` | Long random string (64+ chars) used to sign session tokens |
| `ADMIN_PASSWORD` | Password for the seeded admin account |
| `ADMIN_USERNAME` | *(optional)* Admin account username — defaults to `WolfTeam19` if not set |
| `SESSION_SECRET` | Express session secret (legacy, kept for compatibility) |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | GCS bucket ID for model/asset storage (auto-provisioned) |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Comma-separated public path prefixes in GCS (auto-provisioned) |
| `PRIVATE_OBJECT_DIR` | Base directory for private GCS objects (auto-provisioned) |
| `MESHY_API_KEY` | *(optional)* API key for Meshy.ai text-to-3D generation |
| `BLENDERGPT_API_KEY` | *(optional)* API key for BlenderGPT model generation |

On first startup the API server creates the admin account (role: `admin`) using `ADMIN_USERNAME` / `ADMIN_PASSWORD` if it does not already exist. Migration SQL is in `lib/db/drizzle/`.

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

The shared `@workspace/api-zod` package exports Zod schemas at the package root
(only — the types re-export was stripped in `patch-index.mjs` run during codegen
to avoid TS2308 name collisions) and TypeScript interfaces under the
`./types/*` subpath (e.g. `@workspace/api-zod/types/traceFrame`).

## 3D Model Art Library

Accessed via the **Art Library** button in the editor toolbar.

### Features
- **My Gallery tab**: Upload `.glb`/`.gltf` files via pre-signed GCS URLs, view a thumbnail grid of stored models, add any model to the current project's visual manifest, delete models.
- **Meshy.ai tab**: Enter a text prompt → calls `POST /api/models/generate/meshy` → polls `GET /api/models/generate/meshy/:jobId` every 3 seconds until `SUCCEEDED`/`FAILED`/`EXPIRED`. On success, saves the model to GCS and registers it in the DB.
- **BlenderGPT tab**: Same flow using `POST /api/models/generate/blendergpt` → `GET /api/models/generate/blendergpt/:jobId`.

### API Surface (`/api/models/*`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/models` | List current user's models |
| POST | `/api/models/upload-url` | Request a pre-signed GCS upload URL |
| POST | `/api/models/register` | Register an uploaded model in the DB |
| POST | `/api/models/generate/meshy` | Kick off Meshy.ai text-to-3D job |
| GET | `/api/models/generate/meshy/:jobId` | Poll Meshy job status |
| POST | `/api/models/generate/blendergpt` | Kick off BlenderGPT job |
| GET | `/api/models/generate/blendergpt/:jobId` | Poll BlenderGPT job status |
| GET | `/api/models/:id` | Get a single model record |
| DELETE | `/api/models/:id` | Delete a model (DB + GCS object) |

### DB Schema
`modelsTable` in `lib/db/src/schema/index.ts`:
- `id`, `userId` (FK → users), `name`, `source` (enum: `upload | meshy | blendergpt`), `storageKey`, `thumbnailUrl`, `meshyJobId`, `blendergptJobId`, `createdAt`

### Add to Project
`POST /api/pacengine/projects/:id/meshes` → writes an entry to the project's `visual_manifest.json` under `art_library_meshes`.

## .pacexport Import Format

A `.pacexport` package consists of two files stored side-by-side in
`pacengine/examples/`:

| File | Description |
|------|-------------|
| `<id>.pacdata.json` | Core simulation (entities, ECS, ConflictSim) |
| `<id>.visual_manifest.json` | Optional visual sidecar (environment, GI, post-processing, entity/mesh overrides) |

**Import endpoint**: `POST /api/pacengine/projects/import-pacexport`
- Body: `{ name, worldPacdataJson, visualManifestJson? }`
- Validates both JSON blobs before writing
- `GET /api/pacengine/projects/:id` returns `visualManifest` if the sidecar exists

**visual_manifest.json schema** (v1.0.0) — all fields optional:
```jsonc
{
  "visualVersion": "1.0.0",
  "environment": {
    "skyModel": "physical_sky",   // physical_sky | hdri | procedural
    "sunDirection": [0.5, 0.8, 0.3],
    "sunIntensity": 1.2,
    "atmosphericDensity": 1.0,
    "fogDensity": 0.02,
    "fogColor": [0.7, 0.8, 0.9]
  },
  "globalIllumination": {
    "giType": "voxel_probe_hybrid", // voxel_probe_hybrid | probe_grid | sdf | none
    "probeDensity": "medium",
    "voxelSize": 0.5
  },
  "postProcessing": { "tonemap": "aces", "bloomIntensity": 0.3, "exposure": 1.0 },
  "entities": [{ "id": "hero", "render": { "asset": "assets/models/hero.gltf", "animationState": "idle", "castShadows": true } }],
  "staticMeshes": [{ "id": "terrain", "asset": "assets/models/terrain.gltf", "materialIntent": "rock_rough" }],
  "lights": [{ "type": "directional", "intensity": 1.5, "color": [1.0, 0.95, 0.8] }]
}
```

The editor Details panel shows a **Visual Properties** section (Environment,
Global Illumination, Post-processing, Entity Overrides, Static Meshes, Lights)
when a sidecar exists. A **Import .pacexport** button in the editor toolbar
opens a paste-in dialog for both JSON files.

## M2.5 — Tier 2 Foundation: 3D Rendering MVP + PacAi Visual Import Pipeline

### C++ Render Layer (`pacengine/render/`)

Gated behind `PACENGINE_BUILD_RENDER=OFF` (default) — existing builds are unaffected.
Enable with `cmake -DPACENGINE_BUILD_RENDER=ON ..`.

```
pacengine/render/
├── CMakeLists.txt              # PACENGINE_BUILD_RENDER option, optional Vulkan SDK, fastgltf hook
├── core/
│   ├── render_types.h          # PacVec3, PacMat4, LightData, EnvironmentData, GiSettings, PostProcessSettings
│   ├── PacRenderer.h/.cpp      # Top-level API: Initialize, BeginFrame/Render/EndFrame, ImportPacAiExport, SetCamera
│   ├── RenderScene.h/.cpp      # Proxy map, lights, env/GI/PP settings, per-frame Render()
│   ├── RenderProxy.h/.cpp      # Per-entity GPU state (mesh, material, transform, shadows, animation)
│   └── Material.h/.cpp         # PBR MaterialProperties, 5 texture slots, BuildPipeline()
├── assets/
│   ├── GltfLoader.h/.cpp       # glTF 2.0 stub (Phase 2.5.1: swap in fastgltf)
│   └── TextureManager.h/.cpp   # Path-keyed texture cache, HDR support
├── backend/
│   └── VulkanContext.h/.cpp    # Swapchain stub; guarded behind HAVE_VULKAN
├── effects/
│   ├── SkySystem.h             # physical_sky / hdri / procedural modes
│   ├── FogSystem.h             # Exponential height-based fog
│   └── PostProcess.h           # ACES tonemap + bloom + exposure
└── bindings/
    └── PacRendererBridge.h     # extern "C" flat API for N-API / WASM bridge (Phase 2.5.3)
```

**Phase roadmap:**
- **2.5.1** (next): Vulkan context + swapchain + triangle. Integrate fastgltf via FetchContent.
- **2.5.2** (next): `ImportPacAiExport()` — parse pacdata + visual_manifest, create proxies, apply env.
- **2.5.3** (next): N-API/WASM bridge. Replace stub bridge in `usePacRenderer.ts`. 3D mode renders real frames.

### Editor 3D Integration

**2D ↔ 3D toggle** — pill in the editor toolbar (left of project name area).

| File | Purpose |
|------|---------|
| `src/components/Viewport3D.tsx` | **React Three Fiber** 3D scene. Real WebGL renderer with Sky (physical sky simulation), OrbitControls (LMB rotate / RMB pan / scroll zoom), atmospheric fog, infinite perspective grid, animated entity meshes (spheres for agents, boxes for obstacles) with movement trail lines, billboarded labels, click selection, smooth position lerp, and GLTF model loading for Art Library assets. |
| `src/hooks/usePacRenderer.ts` | Legacy bridge hook — kept for Phase 2.5.3 N-API integration. Resolves `window.__pacRenderer` (real native module) or falls back to `stubBridge`. |

**Data flow (current):** `viewMode === "3D"` → `Viewport3D` (React Three Fiber Canvas) → `SceneContent` renders Sky + Grid + EntityMesh array + art library GLTF models. Entities update each frame via smooth lerp as `currentFrameEntities` changes.

**Art Library integration:** `artLibraryMeshes` prop (from `visualManifest.art_library_meshes`) is passed to `Viewport3D`. Each entry is loaded as a GLTF model (`/api/storage/object/<storageKey>`) and placed in the scene using `useGLTF` + `Suspense`.

### Visual Manifest Editor

`src/components/VisualManifestEditor.tsx` — live-editable form that replaces the read-only Visual Properties panel in the Details sidebar when a `visual_manifest.json` sidecar exists.

| Section | Controls |
|---------|----------|
| Environment | Sky type dropdown, sun intensity slider, ambient intensity slider, sun color picker, fog toggle, fog density slider, fog color picker |
| Global Illumination | GI type dropdown, probe density dropdown |
| Post-Processing | Tonemap dropdown, exposure/bloom/contrast/saturation sliders |

**Live 3D feedback:** every slider/picker change calls `onDraftChange` which updates `liveManifest` in `editor.tsx`. This prop flows to `Viewport3D` → `SceneContent` where it drives directional light intensity/position, ambient light intensity, tone mapping exposure, and fog density/color in real time — before the user hits Save.

**Save:** calls `PATCH /api/pacengine/projects/:id/visual-manifest` → `writeVisualManifest()` → persists to `<id>.visual_manifest.json`. On success, `getGetProjectQueryKey` is invalidated so the query cache refreshes.

**Data flow (Phase 2.5.3):** C++ `PacRenderer` exposed via `window.__pacRenderer` → `usePacRenderer` resolves real bridge → each simulation tick sends delta to `updateSimulationState()` → dirty proxies rebuilt → frame rendered to canvas (will replace R3F layer).
