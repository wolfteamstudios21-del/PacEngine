import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { logger } from "./logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _require   = createRequire(import.meta.url);

// Resolve the napi package directory robustly across dev (tsx src/lib/) and
// production (compiled dist/lib/).  process.cwd() is the api-server package
// root when launched by pnpm; __dirname varies by build mode.
function resolveNapiDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "pacengine/napi"),            // cwd = workspace root
    path.resolve(process.cwd(), "../../pacengine/napi"),      // cwd = api-server pkg
    path.resolve(__dirname, "../../../pacengine/napi"),        // dist/lib/ → 3 up
    path.resolve(__dirname, "../../../../pacengine/napi"),     // src/lib/ → 4 up
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.js"))) return dir;
  }
  return candidates[1]; // best guess fallback
}

const NAPI_DIR = resolveNapiDir();
export const WORKSPACE_ROOT = path.resolve(NAPI_DIR, "../..");

interface ImportExportResult {
  success: boolean;
  entities: number;
  staticMeshes: number;
}

interface SimulationTickResult {
  tickCount: number;
  elapsedSeconds: number;
  simLoaded: boolean;
}

interface EntityPositionSnapshot {
  id: number;
  x: number;
  y: number;
  z: number;
}

interface EntitySnapshotResult extends SimulationTickResult {
  entities: EntityPositionSnapshot[];
}

interface TickControlResult {
  running: boolean;
  hz?: number;
}

interface NativeAddon {
  initialize(width: number, height: number): boolean;
  shutdown(): void;
  importExport(folderPath: string): ImportExportResult;
  beginFrame(): void;
  render(): void;
  endFrame(): void;
  resize(width: number, height: number): void;
  setViewportMode(use3D: boolean): void;
  updateSimulationState(state: { entityCount: number; tickIndex: number }): void;
  setCamera(params: { position: [number, number, number]; target: [number, number, number]; fov?: number }): void;
  getFrameCount(): number;
  isInitialized(): boolean;
  // M3 tick bindings
  startTick(hz?: number): TickControlResult;
  stopTick(): TickControlResult;
  stepTick(dt?: number): SimulationTickResult;
  getEntitySnapshot(): EntitySnapshotResult;
}

const stubAddon: NativeAddon = {
  initialize:             () => false,
  shutdown:               () => {},
  importExport:           () => ({ success: false, entities: 0, staticMeshes: 0 }),
  beginFrame:             () => {},
  render:                 () => {},
  endFrame:               () => {},
  resize:                 () => {},
  setViewportMode:        () => {},
  updateSimulationState:  () => {},
  setCamera:              () => {},
  getFrameCount:          () => 0,
  isInitialized:          () => false,
  startTick:              (hz) => ({ running: true, hz: hz ?? 20 }),
  stopTick:               () => ({ running: false }),
  stepTick:               () => ({ tickCount: 0, elapsedSeconds: 0, simLoaded: false }),
  getEntitySnapshot:      () => ({ entities: [], tickCount: 0, elapsedSeconds: 0, simLoaded: false }),
};

let _isNative = false;
let _addon: NativeAddon = stubAddon;

try {
  const mod = _require(path.join(NAPI_DIR, "index.js")) as { addon: NativeAddon; isNative: boolean };
  _addon    = mod.addon;
  _isNative = mod.isNative;
  logger.info({ napiDir: NAPI_DIR, native: _isNative },
    _isNative ? "[renderer-bridge] native addon loaded" : "[renderer-bridge] stub mode");
} catch (err) {
  logger.warn({ err: err instanceof Error ? err.message : String(err), napiDir: NAPI_DIR },
    "[renderer-bridge] pacengine-napi not found — stub mode");
}

export const isNative = _isNative;
export const addon    = _addon;

// ── Public API ────────────────────────────────────────────────────────────────
// Frame pump is driven exclusively by the browser's rAF loop via POST /renderer/frame
// at 60 Hz. There is no server-side interval pump to prevent double-cycle conflicts.

export function rendererInitialize(width: number, height: number) {
  const initialized = _addon.initialize(width, height);
  return { initialized, native: _isNative };
}

export function rendererShutdown() {
  _addon.shutdown();
}

export function rendererFrame(): { frameCount: number } {
  if (_addon.isInitialized()) {
    _addon.beginFrame();
    _addon.render();
    _addon.endFrame();
  }
  return { frameCount: _addon.getFrameCount() };
}

export function rendererImportExport(folderPath: string): ImportExportResult {
  return _addon.importExport(folderPath);
}

export function rendererResize(width: number, height: number) {
  _addon.resize(width, height);
}

export function rendererSetViewportMode(use3D: boolean) {
  _addon.setViewportMode(use3D);
}

export function rendererUpdateSimulationState(entityCount: number, tickIndex: number) {
  _addon.updateSimulationState({ entityCount, tickIndex });
}

export function rendererSetCamera(
  position: [number, number, number],
  target: [number, number, number],
  fov = 60
) {
  _addon.setCamera({ position, target, fov });
}

export function rendererStatus() {
  return {
    initialized: _addon.isInitialized(),
    native:      _isNative,
    frameCount:  _addon.getFrameCount(),
  };
}

// ─── M3 Simulation tick ───────────────────────────────────────────────────────

export function rendererStartTick(hz?: number) {
  return _addon.startTick(hz);
}

export function rendererStopTick() {
  return _addon.stopTick();
}

export function rendererSimulationStep(dt?: number) {
  return _addon.stepTick(dt);
}

export function rendererGetEntitySnapshot() {
  return _addon.getEntitySnapshot();
}
