import { useRef, useCallback, useEffect, useState } from "react";
import { rendererBridge, type ImportExportResult } from "../lib/renderer-bridge";

export type ViewMode = "2D" | "3D";
export type { ImportExportResult };

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

    rendererBridge.initialize(w, h)
      .then((data) => {
        if (!mountedRef.current) return;
        setIsReady(data.initialized);
        setIsNative(data.native);
      })
      .catch((err: unknown) => console.warn("[usePacRenderer] initialize failed:", err));

    // rAF loop: drives BeginFrame→Render→EndFrame at ~60 Hz via POST /renderer/frame.
    // Status is polled every 5 s to keep isReady/isNative current.
    const FRAME_MS = 1000 / 60;
    const POLL_MS  = 5_000;

    const tick = (nowMs: number) => {
      if (!mountedRef.current) return;
      rafRef.current = requestAnimationFrame(tick);

      if (nowMs - lastFrameMs.current >= FRAME_MS) {
        lastFrameMs.current = nowMs;
        rendererBridge.frame().catch(() => {});
      }

      if (nowMs - lastPollMs.current >= POLL_MS) {
        lastPollMs.current = nowMs;
        rendererBridge.status()
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
      rendererBridge.resize(canvas.clientWidth, canvas.clientHeight).catch(() => {});
    };
    const ro = new ResizeObserver(onResize);
    if (canvas) ro.observe(canvas);

    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      rendererBridge.shutdown().catch(() => {});
      setIsReady(false);
      setIsNative(false);
    };
  }, [canvasRef, enabled]);

  const setCamera = useCallback(
    (pos: [number, number, number], target: [number, number, number], fov = 60) => {
      rendererBridge.setCamera(pos, target, fov).catch(() => {});
    },
    []
  );

  const importExport = useCallback(
    (folderPath: string): Promise<ImportExportResult> => rendererBridge.importExport(folderPath),
    []
  );

  const updateState = useCallback((entityCount: number, tickIndex: number) => {
    rendererBridge.updateSimulationState(entityCount, tickIndex).catch(() => {});
  }, []);

  return { isReady, isNative, setCamera, importExport, updateState };
}
