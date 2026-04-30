export interface ImportExportResult {
  success: boolean;
  entities: number;
  staticMeshes: number;
}

export interface SimulationStateUpdate {
  entityCount: number;
  tickIndex: number;
}

export interface CameraParams {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

/** Lightweight per-entity position snapshot returned by getEntitySnapshot(). */
export interface EntityPositionSnapshot {
  id: number;
  x: number;
  y: number;
  z: number;
}

/** Result of stepTick(). */
export interface SimulationTickResult {
  tickCount: number;
  elapsedSeconds: number;
  simLoaded: boolean;
}

/** Result of getEntitySnapshot(). */
export interface EntitySnapshotResult extends SimulationTickResult {
  entities: EntityPositionSnapshot[];
}

export interface TickControlResult {
  running: boolean;
  hz?: number;
}

export interface NativeAddon {
  initialize(width: number, height: number): boolean;
  shutdown(): void;
  importExport(folderPath: string): ImportExportResult;
  beginFrame(): void;
  render(): void;
  endFrame(): void;
  resize(width: number, height: number): void;
  setViewportMode(use3D: boolean): void;
  updateSimulationState(state: SimulationStateUpdate): void;
  setCamera(params: CameraParams): void;
  getFrameCount(): number;
  isInitialized(): boolean;
  /** M3: Record that a tick loop has started at the given Hz (default 20). */
  startTick(hz?: number): TickControlResult;
  /** M3: Record that the tick loop has stopped. */
  stopTick(): TickControlResult;
  /** M3: Advance simulation by dt seconds (default 0.05 = 20 Hz). */
  stepTick(dt?: number): SimulationTickResult;
  /** M3: Return current entity positions and sim state. */
  getEntitySnapshot(): EntitySnapshotResult;
}

export declare const addon: NativeAddon;
export declare const isNative: boolean;
