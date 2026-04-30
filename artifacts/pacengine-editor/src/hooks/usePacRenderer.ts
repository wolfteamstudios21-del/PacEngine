// usePacRenderer.ts — M2.5.3 HTTP bridge: React editor → C++ PacRenderer
//
// Architecture:
//   Browser → HTTP API → @workspace/api-server → pacengine-napi (.node) → C++ PacRenderer
//
// The C++ PacRenderer lives in the API server process (Node.js), wrapped by the
// N-API addon (pacengine/napi/).  On Replit it uses the stub Vulkan backend (no
// GPU); on a developer machine with a Vulkan SDK it produces real GPU frames.
//
// Frame pump: runs server-side via setInterval at ~60 Hz once the renderer is
// initialized.  The browser's requestAnimationFrame loop in this hook drives the
// call-boundary timing check and status polling — Vulkan commands are issued
// server-side.  GPU pixels are not yet surfaced to the browser (Phase 3.0).

import { useRef, useCallback, useEffect, useState } from "react";

export type ViewMode = "2D" | "3D";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ImportExportResult {
  success:      boolean;
  entities:     number;
  staticMeshes: number;
}

export interface UsePacRendererOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  enabled?: boolean;
}

export interface UsePacRendererResult {
  /** True once the server-side PacRenderer::Initialize returned true. */
  isReady: boolean;
  /**
   * True when the compiled .node native addon is active on the server.
   * False in stub/fallback mode (addon not compiled or no GPU).
   */
  isNative: boolean;
  setCamera(
    pos:    [number, number, number],
    target: [number, number, number],
    fov?: number
  ): void;
  importExport(folderPath: string): Promise<ImportExportResult>;
  updateState(worldDelta: unknown): void;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

type FetchMethod = "GET" | "POST" | "DELETE";

async function apiFetch<T>(
  method: FetchMethod,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body:    body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`[usePacRenderer] ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

interface RendererStatusPayload {
  initialized: boolean;
  native:      boolean;
  frameCount:  number;
}

interface RendererInitPayload {
  initialized: boolean;
  native:      boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePacRenderer({
  canvasRef,
  enabled = true,
}: UsePacRendererOptions): UsePacRendererResult {
  const [isReady,  setIsReady]  = useState(false);
  const [isNative, setIsNative] = useState(false);

  const rafRef     = useRef<number>(0);
  const mountedRef = useRef(true);

  // ── Initialize on mount, shut down on unmount ────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    const canvas = canvasRef.current;
    const w = canvas?.clientWidth  || 1280;
    const h = canvas?.clientHeight || 720;

    apiFetch<RendererInitPayload>("POST", "/renderer/initialize", { width: w, height: h })
      .then((data) => {
        if (!mountedRef.current) return;
        setIsReady(data.initialized);
        setIsNative(data.native);
        if (!data.initialized) {
          console.info(
            "[usePacRenderer] Renderer not initialized — " +
            "stub Vulkan backend active (headless / addon not compiled)"
          );
        }
      })
      .catch((err: unknown) => {
        console.warn("[usePacRenderer] initialize request failed:", err);
      });

    // rAF loop — runs at 60 Hz to drive the call-boundary timing check.
    // Every 5 s it also polls /renderer/status to keep isReady / isNative current.
    // Actual BeginFrame → Render → EndFrame are issued server-side at ~60 Hz.
    let lastPollMs = 0;
    const tick = (nowMs: number) => {
      if (!mountedRef.current) return;
      rafRef.current = requestAnimationFrame(tick);
      if (nowMs - lastPollMs > 5_000) {
        lastPollMs = nowMs;
        apiFetch<RendererStatusPayload>("GET", "/renderer/status")
          .then((s) => {
            if (!mountedRef.current) return;
            setIsReady(s.initialized);
            setIsNative(s.native);
          })
          .catch(() => {/* server unreachable — keep current state */});
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    // Resize observer → forward to server-side renderer
    const onResize = () => {
      if (!canvas) return;
      apiFetch("POST", "/renderer/resize", {
        width:  canvas.clientWidth,
        height: canvas.clientHeight,
      }).catch(() => {});
    };
    const ro = new ResizeObserver(onResize);
    if (canvas) ro.observe(canvas);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      apiFetch("DELETE", "/renderer/shutdown").catch(() => {});
      setIsReady(false);
      setIsNative(false);
    };
  }, [canvasRef, enabled]);

  // ── Stable callbacks ─────────────────────────────────────────────────────

  const setCamera = useCallback(
    (
      _pos:    [number, number, number],
      _target: [number, number, number],
      _fov = 60
    ) => {
      // Camera state is applied locally in Viewport3D's 2D Canvas renderer.
      // Phase 3.0 shared-surface will forward camera to the GPU pipeline.
    },
    []
  );

  const importExport = useCallback(
    (folderPath: string): Promise<ImportExportResult> =>
      apiFetch<ImportExportResult>("POST", "/renderer/import-export", { folderPath }),
    []
  );

  const updateState = useCallback((_worldDelta: unknown) => {
    // Phase M3 — simulation-state sync via dedicated endpoint.
  }, []);

  return { isReady, isNative, setCamera, importExport, updateState };
}
