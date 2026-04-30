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
}

export declare const addon: NativeAddon;
export declare const isNative: boolean;
