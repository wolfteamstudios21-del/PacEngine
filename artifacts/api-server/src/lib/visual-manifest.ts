import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { EXAMPLES_DIR } from "./pacengine-paths";

const Vec3 = z.array(z.number()).min(3).max(3);

export const VisualEnvironmentSchema = z
  .object({
    skyModel: z.string().optional(),
    sunDirection: Vec3.optional(),
    sunIntensity: z.number().optional(),
    atmosphericDensity: z.number().optional(),
    fogDensity: z.number().optional(),
    fogColor: Vec3.optional(),
  })
  .optional();

export const VisualGISchema = z
  .object({
    giType: z.string().optional(),
    probeDensity: z.string().optional(),
    voxelSize: z.number().optional(),
  })
  .optional();

export const VisualPostProcessingSchema = z
  .object({
    tonemap: z.string().optional(),
    bloomIntensity: z.number().optional(),
    exposure: z.number().optional(),
  })
  .optional();

export const VisualEntityRenderSchema = z
  .object({
    asset: z.string().optional(),
    animationState: z.string().optional(),
    lodPolicy: z.string().optional(),
    castShadows: z.boolean().optional(),
  })
  .optional();

export const VisualEntityOverrideSchema = z.object({
  id: z.string(),
  render: VisualEntityRenderSchema,
});

export const VisualStaticMeshSchema = z.object({
  id: z.string().optional(),
  asset: z.string().optional(),
  materialIntent: z.string().optional(),
});

export const VisualLightSchema = z.object({
  type: z.enum(["directional", "point", "spot"]).optional(),
  intensity: z.number().optional(),
  color: Vec3.optional(),
});

export const VisualManifestSchema = z.object({
  pacdataVersion: z.string().optional(),
  visualVersion: z.string().optional(),
  environment: VisualEnvironmentSchema,
  globalIllumination: VisualGISchema,
  postProcessing: VisualPostProcessingSchema,
  entities: z.array(VisualEntityOverrideSchema).optional(),
  staticMeshes: z.array(VisualStaticMeshSchema).optional(),
  lights: z.array(VisualLightSchema).optional(),
});

export type VisualManifest = z.infer<typeof VisualManifestSchema>;

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
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}
