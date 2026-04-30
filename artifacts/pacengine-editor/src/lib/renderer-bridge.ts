// renderer-bridge.ts — editor-side interface to the C++ PacRenderer (M2.5.3)
//
// The PacEngine native addon (@workspace/pacengine-napi) runs inside the
// api-server process (Node.js).  Browser code cannot load .node addons directly,
// so this bridge uses HTTP to cross the process boundary.
//
// Runtime path: Browser → HTTP → api-server → @workspace/pacengine-napi → C++

import type { ImportExportResult, NativeAddon } from "@workspace/pacengine-napi";

// Re-export the addon types that the editor uses for type safety.
export type { ImportExportResult, NativeAddon };

// ── HTTP transport ────────────────────────────────────────────────────────────

type Method = "GET" | "POST" | "DELETE";

async function call<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/renderer${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body:    body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[renderer-bridge] ${method} /renderer${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Bridge API (mirrors @workspace/pacengine-napi NativeAddon lifecycle) ──────

export interface RendererStatus {
  initialized: boolean;
  native:      boolean;
  frameCount:  number;
}

export const rendererBridge = {
  status():                  Promise<RendererStatus>      { return call("GET",    "/status"); },
  initialize(w: number, h: number)                        { return call<{ initialized: boolean; native: boolean }>("POST", "/initialize", { width: w, height: h }); },
  shutdown():                Promise<void>                { return call("DELETE", "/shutdown"); },
  frame():                   Promise<{ frameCount: number }> { return call("POST", "/frame"); },
  resize(w: number, h: number): Promise<void>             { return call("POST", "/resize", { width: w, height: h }); },
  importExport(folderPath: string): Promise<ImportExportResult> { return call("POST", "/import-export", { folderPath }); },
  setCamera(position: [number, number, number], target: [number, number, number], fov = 60): Promise<void> {
    return call("POST", "/set-camera", { position, target, fov });
  },
  updateSimulationState(entityCount: number, tickIndex: number): Promise<void> {
    return call("POST", "/update-state", { entityCount, tickIndex });
  },
} as const;
