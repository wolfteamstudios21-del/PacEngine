import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EXAMPLES_DIR } from "./pacengine-paths";

const Vec3 = z.array(z.number()).min(3).max(3);
const Vec4 = z.array(z.number()).min(4).max(4);

// ── Sub-schemas (snake_case to match visual_manifest.json v1.0.0 spec) ──────

export const VisualEnvironmentSchema = z
  .object({
    sky_type: z
      .enum(["physical", "hdr_cubemap", "procedural", "simple"])
      .optional(),
    sun_direction: Vec3.optional(),
    sun_intensity: z.number().optional(),
    sun_color: Vec3.optional(),
    ambient_intensity: z.number().optional(),
    fog_enabled: z.boolean().optional(),
    fog_density: z.number().optional(),
    fog_color: Vec3.optional(),
    fog_height_falloff: z.number().optional(),
  })
  .optional();

export const VisualGISchema = z
  .object({
    gi_type: z
      .enum(["none", "probe_grid", "voxel", "hybrid"])
      .optional(),
    probe_density: z.enum(["low", "medium", "high"]).optional(),
  })
  .optional();

export const VisualPostProcessingSchema = z
  .object({
    tonemap: z.string().optional(),
    exposure: z.number().optional(),
    bloom_intensity: z.number().optional(),
    contrast: z.number().optional(),
    saturation: z.number().optional(),
  })
  .optional();

const MaterialOverrideSchema = z
  .object({
    baseColorFactor: Vec4.optional(),
    metallicFactor: z.number().optional(),
    roughnessFactor: z.number().optional(),
  })
  .optional();

export const VisualEntityRenderSchema = z
  .object({
    asset: z.string(),
    material_overrides: z
      .record(z.string(), MaterialOverrideSchema)
      .optional(),
    cast_shadows: z.boolean().optional(),
    receive_shadows: z.boolean().optional(),
    visible: z.boolean().optional(),
  })
  .optional();

export const VisualEntityOverrideSchema = z.object({
  id: z.number().int(),
  render: VisualEntityRenderSchema,
});

const StaticMeshTransformSchema = z
  .object({
    position: Vec3.optional(),
    rotation: z.array(z.number()).min(4).max(4).optional(),
    scale: Vec3.optional(),
  })
  .optional();

export const VisualStaticMeshSchema = z.object({
  id: z.string(),
  asset: z.string(),
  transform: StaticMeshTransformSchema,
  material_intent: z.string().optional(),
});

export const VisualLightSchema = z.object({
  type: z.enum(["directional", "point", "spot"]).optional(),
  position: Vec3.optional(),
  direction: Vec3.optional(),
  color: Vec3.optional(),
  intensity: z.number().optional(),
  range: z.number().optional(),
});

export const VisualCameraDefaultSchema = z
  .object({
    position: Vec3.optional(),
    target: Vec3.optional(),
  })
  .optional();

export const VisualManifestSchema = z.object({
  visual_version: z.string().optional(),
  pacdata_version: z.string().optional(),
  environment: VisualEnvironmentSchema,
  global_illumination: VisualGISchema,
  entities: z.array(VisualEntityOverrideSchema).optional(),
  static_meshes: z.array(VisualStaticMeshSchema).optional(),
  lights: z.array(VisualLightSchema).optional(),
  post_processing: VisualPostProcessingSchema,
  camera_default: VisualCameraDefaultSchema,
});

export type VisualManifest = z.infer<typeof VisualManifestSchema>;

// ── Parse / IO helpers ───────────────────────────────────────────────────────

export class VisualManifestParseError extends Error {
  constructor(
    message: string,
    public readonly detail: string,
  ) {
    super(message);
    this.name = "VisualManifestParseError";
  }
}

export function parseVisualManifest(raw: string): VisualManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new VisualManifestParseError(
      "visual_manifest.json parse failed",
      err instanceof Error ? err.message : String(err),
    );
  }
  const result = VisualManifestSchema.safeParse(json);
  if (!result.success) {
    throw new VisualManifestParseError(
      "visual_manifest.json validation failed",
      result.error.message,
    );
  }
  return result.data;
}

export function visualManifestPath(projectId: string): string {
  return path.join(EXAMPLES_DIR, `${projectId}.visual_manifest.json`);
}

export async function loadVisualManifest(
  projectId: string,
): Promise<VisualManifest | null> {
  const filePath = visualManifestPath(projectId);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
  try {
    return parseVisualManifest(raw);
  } catch {
    return null;
  }
}

export async function writeVisualManifest(
  projectId: string,
  manifest: VisualManifest,
): Promise<void> {
  const filePath = visualManifestPath(projectId);
  await fs.writeFile(
    filePath,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
}
