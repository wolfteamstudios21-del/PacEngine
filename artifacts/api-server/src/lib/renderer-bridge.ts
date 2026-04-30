import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { logger } from "./logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _require   = createRequire(import.meta.url);

// dist/ → api-server/ → artifacts/ → workspace root
export const WORKSPACE_ROOT = path.resolve(__dirname, "../../..");

// Path from workspace root to the napi package
const NAPI_DIR = path.join(WORKSPACE_ROOT, "pacengine/napi");

interface ImportExportResult {
  success: boolean;
  entities: number;
  staticMeshes: number;
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
};

let _isNative = false;
let _addon: NativeAddon = stubAddon;

try {
  const mod = _require(path.join(NAPI_DIR, "index.js")) as { addon: NativeAddon; isNative: boolean };
  _addon     = mod.addon;
  _isNative  = mod.isNative;
  logger.info(_isNative
    ? "[renderer-bridge] native pacrenderer.node loaded"
    : "[renderer-bridge] pacrenderer.node not compiled — stub mode");
} catch (err) {
  logger.warn({ err: err instanceof Error ? err.message : String(err) },
    "[renderer-bridge] pacengine-napi not found — stub mode");
}

export const isNative = _isNative;
export const addon    = _addon;

// Server-side frame pump: keeps the frame triad running when no browser is connected.
// The browser's rAF loop also drives /renderer/frame at ~30 Hz while connected.
const FRAME_MS = Math.round(1000 / 60);
let _pumpTimer: ReturnType<typeof setInterval> | null = null;

function startPump() {
  if (_pumpTimer !== null) return;
  _pumpTimer = setInterval(() => {
    if (!_addon.isInitialized()) return;
    _addon.beginFrame();
    _addon.render();
    _addon.endFrame();
  }, FRAME_MS);
}

function stopPump() {
  if (_pumpTimer === null) return;
  clearInterval(_pumpTimer);
  _pumpTimer = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function rendererInitialize(width: number, height: number) {
  const initialized = _addon.initialize(width, height);
  if (initialized) startPump();
  return { initialized, native: _isNative };
}

export function rendererShutdown() {
  stopPump();
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
