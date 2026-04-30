import { useRef, useCallback, useEffect, useState } from "react";
import { rendererBridge, type ImportExportResult, type SimulationTickResult } from "../lib/renderer-bridge";

export type ViewMode = "2D" | "3D";
export type { ImportExportResult, SimulationTickResult };

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
  // M3 tick control
  stepTick(dt?: number): Promise<SimulationTickResult>;
  startTick(hz?: number): void;
  stopTick(): void;
  isTickRunning: boolean;
  simTickCount: number;
  simElapsedSeconds: number;
}

export function usePacRenderer({ canvasRef, enabled = true }: UsePacRendererOptions): UsePacRendererResult {
  const [isReady,  setIsReady]  = useState(false);
  const [isNative, setIsNative] = useState(false);

  // M3 tick state
  const [isTickRunning,      setIsTickRunning]      = useState(false);
  const [simTickCount,       setSimTickCount]       = useState(0);
  const [simElapsedSeconds,  setSimElapsedSeconds]  = useState(0);

  const rafRef        = useRef<number>(0);
  const mountedRef    = useRef(true);
  const lastFrameMs   = useRef(0);
  const lastPollMs    = useRef(0);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        rendererBridge.frame().catch((err: unknown) => {
          console.debug("[usePacRenderer] frame tick failed:", err);
        });
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

  // M3 tick control
  const stepTick = useCallback((dt?: number): Promise<SimulationTickResult> => {
    return rendererBridge.simulationStep(dt).then((result) => {
      if (mountedRef.current) {
        setSimTickCount(result.tickCount);
        setSimElapsedSeconds(result.elapsedSeconds);
      }
      return result;
    });
  }, []);

  const startTick = useCallback((hz = 20) => {
    if (tickIntervalRef.current) return;
    const dt = 1 / hz;
    setIsTickRunning(true);
    tickIntervalRef.current = setInterval(() => {
      rendererBridge.simulationStep(dt)
        .then((result) => {
          if (mountedRef.current) {
            setSimTickCount(result.tickCount);
            setSimElapsedSeconds(result.elapsedSeconds);
          }
        })
        .catch(() => {});
    }, 1000 / hz);
  }, []);

  const stopTick = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    setIsTickRunning(false);
  }, []);

  // Clean up tick interval on unmount
  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
    };
  }, []);

  return {
    isReady,
    isNative,
    setCamera,
    importExport,
    updateState,
    stepTick,
    startTick,
    stopTick,
    isTickRunning,
    simTickCount,
    simElapsedSeconds,
  };
}
