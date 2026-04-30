// ─── ConflictSim types ────────────────────────────────────────────────────────
// Defined here until lib/conflict-sim is extracted into its own workspace lib.
// These mirror the shape used by the PacAi ConflictSim v7 runtime.

export interface ConflictRecord {
  id: number;
  faction: string;
  type: string;
  zone?: string;
  severity?: number;
  [key: string]: unknown;
}

export interface FactionRecord {
  id: string;
  name: string;
  color?: string;
  [key: string]: unknown;
}

export interface ZoneRecord {
  id: string;
  name?: string;
  type?: string;
  [key: string]: unknown;
}

export interface DirectorState {
  pacing?: "slow" | "medium" | "fast";
  scenario?: string;
  [key: string]: unknown;
}

export interface ConflictContext {
  history?: ConflictRecord[];
  npcMemory?: Record<string, unknown>;
  directorState?: DirectorState;
}

// ─── Export options ───────────────────────────────────────────────────────────

export interface PacEngineExportOptions {
  projectId: string;
  pacCoreResult?: unknown;
  conflictSnapshot: ConflictContext;
  seed: number;
  description: string;
  factions: FactionRecord[];
  zones: ZoneRecord[];
  conflicts: ConflictRecord[];
  motionProfile?: unknown;
}

// ─── visual_manifest.json v1.0.0 types ───────────────────────────────────────
// Mirror of pacdata/schemas/visual_manifest.json — kept in sync manually.

export type SkyType = "physical" | "hdr_cubemap" | "procedural" | "simple";
export type GiType  = "none" | "probe_grid" | "voxel" | "hybrid";
export type GiDensity = "low" | "medium" | "high";
export type Tonemap = "aces" | "filmic" | "linear";

export interface VisualEnvironment {
  sky_type: SkyType;
  sun_direction: [number, number, number];
  sun_intensity: number;
  sun_color?: [number, number, number];
  ambient_intensity?: number;
  fog_enabled: boolean;
  fog_density: number;
  fog_color?: [number, number, number];
  fog_height_falloff?: number;
}

export interface MaterialOverride {
  baseColorFactor?: [number, number, number, number];
  metallicFactor?: number;
  roughnessFactor?: number;
}

export interface VisualEntityRender {
  asset: string;
  cast_shadows?: boolean;
  receive_shadows?: boolean;
  visible?: boolean;
  material_overrides?: Record<string, MaterialOverride>;
}

export interface VisualEntity {
  id: number;
  render: VisualEntityRender;
}

export interface StaticMeshTransform {
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

export interface VisualStaticMesh {
  id: string;
  asset: string;
  transform?: StaticMeshTransform;
  material_intent?: string;
}

export interface VisualLight {
  type: "directional" | "point" | "spot";
  direction?: [number, number, number];
  position?: [number, number, number];
  color?: [number, number, number];
  intensity?: number;
  range?: number;
}

export interface VisualPostProcessing {
  tonemap?: Tonemap;
  exposure?: number;
  bloom_intensity?: number;
  contrast?: number;
  saturation?: number;
}

export interface VisualCameraDefault {
  position: [number, number, number];
  target: [number, number, number];
}

export interface VisualManifest {
  visual_version: "1.0.0";
  pacdata_version?: string;
  environment: VisualEnvironment;
  global_illumination: { gi_type: GiType; probe_density?: GiDensity };
  entities: VisualEntity[];
  static_meshes: VisualStaticMesh[];
  lights: VisualLight[];
  post_processing: VisualPostProcessing;
  camera_default: VisualCameraDefault;
}
