import { useRef, useCallback, useEffect, useState } from "react";

export type ViewMode = "2D" | "3D";

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
  isReady:  boolean;
  isNative: boolean;
  setCamera(pos: [number, number, number], target: [number, number, number], fov?: number): void;
  importExport(folderPath: string): Promise<ImportExportResult>;
  updateState(entityCount: number, tickIndex: number): void;
}

type FetchMethod = "GET" | "POST" | "DELETE";

async function apiFetch<T>(method: FetchMethod, path: string, body?: unknown): Promise<T> {
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

interface RendererStatusPayload { initialized: boolean; native: boolean; frameCount: number }
interface RendererInitPayload   { initialized: boolean; native: boolean }

export function usePacRenderer({ canvasRef, enabled = true }: UsePacRendererOptions): UsePacRendererResult {
  const [isReady,  setIsReady]  = useState(false);
  const [isNative, setIsNative] = useState(false);

  const rafRef      = useRef<number>(0);
  const mountedRef  = useRef(true);
  const lastFrameMs = useRef(0);
  const lastPollMs  = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    const canvas = canvasRef.current;
    const w = canvas?.clientWidth  ?? 1280;
    const h = canvas?.clientHeight ?? 720;

    apiFetch<RendererInitPayload>("POST", "/renderer/initialize", { width: w, height: h })
      .then((data) => {
        if (!mountedRef.current) return;
        setIsReady(data.initialized);
        setIsNative(data.native);
      })
      .catch((err: unknown) => console.warn("[usePacRenderer] initialize failed:", err));

    // rAF loop: drives BeginFrame→Render→EndFrame at ~30 Hz via POST /renderer/frame,
    // and polls status at 5 s intervals to keep isReady/isNative current.
    const FRAME_INTERVAL_MS = 1000 / 30;
    const POLL_INTERVAL_MS  = 5_000;

    const tick = (nowMs: number) => {
      if (!mountedRef.current) return;
      rafRef.current = requestAnimationFrame(tick);

      if (nowMs - lastFrameMs.current >= FRAME_INTERVAL_MS) {
        lastFrameMs.current = nowMs;
        apiFetch("POST", "/renderer/frame").catch(() => {});
      }

      if (nowMs - lastPollMs.current >= POLL_INTERVAL_MS) {
        lastPollMs.current = nowMs;
        apiFetch<RendererStatusPayload>("GET", "/renderer/status")
          .then((s) => {
            if (!mountedRef.current) return;
            setIsReady(s.initialized);
            setIsNative(s.native);
          })
          .catch(() => {});
      }
    };
    rafRef.current = requestAnimationFrame(tick);

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

  const setCamera = useCallback(
    (pos: [number, number, number], target: [number, number, number], fov = 60) => {
      apiFetch("POST", "/renderer/set-camera", { position: pos, target, fov }).catch(() => {});
    },
    []
  );

  const importExport = useCallback(
    (folderPath: string): Promise<ImportExportResult> =>
      apiFetch<ImportExportResult>("POST", "/renderer/import-export", { folderPath }),
    []
  );

  const updateState = useCallback((entityCount: number, tickIndex: number) => {
    apiFetch("POST", "/renderer/update-state", { entityCount, tickIndex }).catch(() => {});
  }, []);

  return { isReady, isNative, setCamera, importExport, updateState };
}
