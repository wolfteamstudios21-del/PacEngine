import { useRef, useCallback, useEffect } from "react";

export type ViewMode = "2D" | "3D";

// Describes the bridge surface that the C++ PacRenderer will expose in Phase 2.5.3.
// For now all methods are no-ops so the hook compiles and can be wired into the editor
// without a real native module.
interface PacRendererBridge {
  initialize(width: number, height: number): Promise<boolean>;
  importPacAiExport(exportPath: string): Promise<boolean>;
  setCamera(
    pos: [number, number, number],
    target: [number, number, number],
    fov?: number
  ): void;
  updateSimulationState(worldDelta: unknown): void;
  beginFrame(): void;
  render(): void;
  endFrame(): void;
  resize(width: number, height: number): void;
  shutdown(): void;
}

// Stub bridge used until the N-API / WASM module is available (Phase 2.5.3).
const stubBridge: PacRendererBridge = {
  initialize: async () => {
    console.info("[PacRenderer] stub initialize");
    return false;
  },
  importPacAiExport: async (path) => {
    console.info("[PacRenderer] stub importPacAiExport:", path);
    return false;
  },
  setCamera: () => {},
  updateSimulationState: () => {},
  beginFrame: () => {},
  render: () => {},
  endFrame: () => {},
  resize: () => {},
  shutdown: () => {},
};

// Loads the real native bridge at runtime if it has been registered on
// window.__pacRenderer (e.g. injected by the Electron shell or N-API loader).
function resolveBridge(): PacRendererBridge {
  const w = window as unknown as Record<string, unknown>;
  return (w["__pacRenderer"] as PacRendererBridge | undefined) ?? stubBridge;
}

export interface UsePacRendererOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  enabled?: boolean;
}

export interface UsePacRendererResult {
  isReady: boolean;
  setCamera: PacRendererBridge["setCamera"];
  importExport: PacRendererBridge["importPacAiExport"];
  updateState: PacRendererBridge["updateSimulationState"];
}

export function usePacRenderer({
  canvasRef,
  enabled = true,
}: UsePacRendererOptions): UsePacRendererResult {
  const bridgeRef = useRef<PacRendererBridge>(resolveBridge());
  const readyRef  = useRef(false);

  useEffect(() => {
    if (!enabled || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const bridge = bridgeRef.current;

    bridge
      .initialize(canvas.clientWidth || 1280, canvas.clientHeight || 720)
      .then((ok) => {
        readyRef.current = ok;
        if (!ok) {
          console.info(
            "[usePacRenderer] Stub bridge active — real renderer not loaded yet."
          );
        }
      });

    const onResize = () => {
      bridge.resize(canvas.clientWidth, canvas.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(canvas);

    return () => {
      ro.disconnect();
      bridge.shutdown();
      readyRef.current = false;
    };
  }, [canvasRef, enabled]);

  const setCamera = useCallback<PacRendererBridge["setCamera"]>(
    (...args) => bridgeRef.current.setCamera(...args),
    []
  );

  const importExport = useCallback<PacRendererBridge["importPacAiExport"]>(
    (path) => bridgeRef.current.importPacAiExport(path),
    []
  );

  const updateState = useCallback<PacRendererBridge["updateSimulationState"]>(
    (delta) => bridgeRef.current.updateSimulationState(delta),
    []
  );

  return {
    isReady: readyRef.current,
    setCamera,
    importExport,
    updateState,
  };
}
