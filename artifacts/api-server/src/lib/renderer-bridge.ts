// renderer-bridge.ts — server-side singleton wrapping @workspace/pacengine-napi
//
// Loads the compiled native addon when available; stubs all methods otherwise,
// so the API server starts cleanly on Replit (or any environment where node-gyp
// has not been run).
//
// The frame pump (BeginFrame → Render → EndFrame) runs on a server-side timer
// at ~60 Hz once the renderer is initialised.  GPU pixels are not surfaced to
// the browser in M2.5 (out of scope until Phase 3.0 shared surface).

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { logger } from "./logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// createRequire is needed in ESM to load CJS packages (the .node addon loader)
const _require = createRequire(import.meta.url);

// ── Native addon types ────────────────────────────────────────────────────────

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
  getFrameCount(): number;
  isInitialized(): boolean;
}

// ── Load addon (try/catch so server starts even without a compiled .node) ─────

// __dirname resolves to artifacts/api-server/dist/ in the compiled bundle.
// From dist/ → api-server/ → artifacts/ → workspace/ → pacengine/napi/
const NAPI_DIR = path.resolve(__dirname, "../../../pacengine/napi");

let _isNative = false;
let _addon: NativeAddon;

try {
  const mod = _require(path.join(NAPI_DIR, "index.js")) as {
    addon: NativeAddon;
    isNative: boolean;
  };
  _addon = mod.addon;
  _isNative = mod.isNative;
  if (_isNative) {
    logger.info("[renderer-bridge] Loaded native pacrenderer.node addon");
  } else {
    logger.info("[renderer-bridge] pacrenderer.node not compiled — stub mode");
  }
} catch (err) {
  logger.warn(
    { err: err instanceof Error ? err.message : String(err) },
    "[renderer-bridge] Failed to load pacengine-napi — stub mode"
  );
  _isNative = false;
  _addon = {
    initialize:      () => false,
    shutdown:        () => {},
    importExport:    () => ({ success: false, entities: 0, staticMeshes: 0 }),
    beginFrame:      () => {},
    render:          () => {},
    endFrame:        () => {},
    resize:          () => {},
    setViewportMode: () => {},
    getFrameCount:   () => 0,
    isInitialized:   () => false,
  };
}

export const isNative = _isNative;
export const addon    = _addon;

// ── Frame pump ────────────────────────────────────────────────────────────────

const FRAME_INTERVAL_MS = Math.round(1000 / 60); // ~16.67 ms ≈ 60 Hz
let _pumpTimer: ReturnType<typeof setInterval> | null = null;

function startPump(): void {
  if (_pumpTimer !== null) return;
  _pumpTimer = setInterval(() => {
    if (!_addon.isInitialized()) return;
    _addon.beginFrame();
    _addon.render();
    _addon.endFrame();
  }, FRAME_INTERVAL_MS);
}

function stopPump(): void {
  if (_pumpTimer === null) return;
  clearInterval(_pumpTimer);
  _pumpTimer = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function rendererInitialize(
  width: number,
  height: number
): { initialized: boolean; native: boolean } {
  const initialized = _addon.initialize(width, height);
  if (initialized) {
    startPump();
    logger.info({ width, height }, "[renderer-bridge] Renderer initialised");
  }
  return { initialized, native: _isNative };
}

export function rendererShutdown(): void {
  stopPump();
  _addon.shutdown();
  logger.info("[renderer-bridge] Renderer shut down");
}

export function rendererImportExport(folderPath: string): ImportExportResult {
  return _addon.importExport(folderPath);
}

export function rendererResize(width: number, height: number): void {
  _addon.resize(width, height);
}

export function rendererSetViewportMode(use3D: boolean): void {
  _addon.setViewportMode(use3D);
}

export function rendererStatus(): {
  initialized: boolean;
  native:      boolean;
  frameCount:  number;
} {
  return {
    initialized: _addon.isInitialized(),
    native:      _isNative,
    frameCount:  _addon.getFrameCount(),
  };
}
