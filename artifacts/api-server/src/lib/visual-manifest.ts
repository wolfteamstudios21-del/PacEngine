import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EXAMPLES_DIR } from "./pacengine-paths";

const Vec3 = z.array(z.number()).min(3).max(3);
const Vec4 = z.array(z.number()).min(4).max(4);

// ── Sub-schemas ───────────────────────────────────────────────────────────────

// Environment accepts both the flat structure (sky_type, fog_enabled, etc.) and
// the nested v7 structure where sky and fog are sub-objects.
export const VisualEnvironmentSchema = z
  .preprocess((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const obj = raw as Record<string, unknown>;
    const out: Record<string, unknown> = { ...obj };

    // Flatten nested sky sub-object: { sky: { type: "physical" } } → sky_type
    if (obj["sky"] && typeof obj["sky"] === "object" && !Array.isArray(obj["sky"])) {
      const sky = obj["sky"] as Record<string, unknown>;
      if (!("sky_type" in out) && sky["type"] !== undefined) out["sky_type"] = sky["type"];
      if (!("sun_direction" in out) && sky["sun_direction"] !== undefined) out["sun_direction"] = sky["sun_direction"];
      if (!("sun_intensity" in out) && sky["sun_intensity"] !== undefined) out["sun_intensity"] = sky["sun_intensity"];
      if (!("sun_color" in out) && sky["sun_color"] !== undefined) out["sun_color"] = sky["sun_color"];
      if (!("ambient_intensity" in out) && sky["ambient_intensity"] !== undefined) out["ambient_intensity"] = sky["ambient_intensity"];
    }

    // Flatten nested fog sub-object: { fog: { enabled: true, density: 0.5 } }
    if (obj["fog"] && typeof obj["fog"] === "object" && !Array.isArray(obj["fog"])) {
      const fog = obj["fog"] as Record<string, unknown>;
      if (!("fog_enabled" in out) && fog["enabled"] !== undefined) out["fog_enabled"] = fog["enabled"];
      if (!("fog_density" in out) && fog["density"] !== undefined) out["fog_density"] = fog["density"];
      if (!("fog_color" in out) && fog["color"] !== undefined) out["fog_color"] = fog["color"];
      if (!("fog_height_falloff" in out) && fog["height_falloff"] !== undefined) out["fog_height_falloff"] = fog["height_falloff"];
    }

    return out;
  }, z
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
    .passthrough()
    .optional(),
  )
  .optional();

// probe_density accepts the string enum or a [x, y, z] numeric array (v7)
const ProbeDensitySchema = z.union([
  z.enum(["low", "medium", "high"]),
  z.array(z.number()),
]);

export const VisualGISchema = z
  .object({
    gi_type: z
      .enum(["none", "probe_grid", "voxel", "hybrid"])
      .optional(),
    probe_density: ProbeDensitySchema.optional(),
  })
  .passthrough()
  .optional();

export const VisualPostProcessingSchema = z
  .object({
    tonemap: z.string().optional(),
    exposure: z.number().optional(),
    bloom_intensity: z.number().optional(),
    contrast: z.number().optional(),
    saturation: z.number().optional(),
  })
  .passthrough()
  .optional();

const MaterialOverrideSchema = z
  .object({
    baseColorFactor: Vec4.optional(),
    metallicFactor: z.number().optional(),
    roughnessFactor: z.number().optional(),
  })
  .passthrough()
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
  .passthrough()
  .optional();

// Entity id can be an integer or a string (v7 uses string IDs).
// passthrough() preserves v7-specific fields like mesh, material, animation_profile.
export const VisualEntityOverrideSchema = z
  .object({
    id: z.union([z.number().int(), z.string()]),
    render: VisualEntityRenderSchema,
  })
  .passthrough();

const StaticMeshTransformSchema = z
  .object({
    position: Vec3.optional(),
    rotation: z.array(z.number()).min(4).max(4).optional(),
    scale: Vec3.optional(),
  })
  .passthrough()
  .optional();

export const VisualStaticMeshSchema = z
  .object({
    id: z.string(),
    asset: z.string(),
    transform: StaticMeshTransformSchema,
    material_intent: z.string().optional(),
  })
  .passthrough();

// Lights allow unknown extra keys (e.g. shadows sub-object in v7)
export const VisualLightSchema = z
  .object({
    type: z.enum(["directional", "point", "spot"]).optional(),
    position: Vec3.optional(),
    direction: Vec3.optional(),
    color: Vec3.optional(),
    intensity: z.number().optional(),
    range: z.number().optional(),
  })
  .passthrough();

export const VisualCameraDefaultSchema = z
  .object({
    position: Vec3.optional(),
    target: Vec3.optional(),
  })
  .passthrough()
  .optional();

export const VisualManifestSchema = z
  .preprocess((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
    const obj = raw as Record<string, unknown>;
    const out: Record<string, unknown> = { ...obj };

    // Accept postfx as alias for post_processing
    if (!("post_processing" in out) && "postfx" in obj) {
      out["post_processing"] = obj["postfx"];
    }

    // Accept camera_defaults (plural) as alias for camera_default
    if (!("camera_default" in out) && "camera_defaults" in obj) {
      out["camera_default"] = obj["camera_defaults"];
    }

    // Accept version as alias for visual_version (v7 uses "version")
    if (!("visual_version" in out) && "version" in obj) {
      out["visual_version"] = obj["version"];
    }

    return out;
  }, z.object({
    visual_version: z.string().optional(),
    pacdata_version: z.string().optional(),
    environment: VisualEnvironmentSchema,
    global_illumination: VisualGISchema,
    entities: z.array(VisualEntityOverrideSchema).optional(),
    static_meshes: z.array(VisualStaticMeshSchema).optional(),
    lights: z.array(VisualLightSchema).optional(),
    post_processing: VisualPostProcessingSchema,
    camera_default: VisualCameraDefaultSchema,
    // Allow terrain block and other unknown top-level keys without failing
  }).passthrough());

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
    // Build a human-readable error listing the first few issues
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    throw new VisualManifestParseError(
      "visual_manifest.json validation failed",
      issues,
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
