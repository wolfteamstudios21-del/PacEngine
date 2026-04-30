import fs from "fs/promises";
import path from "path";

import { buildPacData } from "./pacdata-builder.js";
import { buildVisualManifest } from "./visual-manifest-builder.js";
import type { PacEngineExportOptions } from "./types.js";

export type { PacEngineExportOptions, ConflictContext, VisualManifest } from "./types.js";

/**
 * Exports PacCore / ConflictSim data into a self-contained folder that
 * PacEngine can import and run deterministically.
 *
 * Output structure:
 *   exports/<projectId>/<timestamp>/
 *     world.pacdata.json      — simulation state
 *     visual_manifest.json   — v1.0.0 rendering manifest
 *     assets/                — (Phase M3) glTF models copied here
 *
 * @returns The absolute path to the written export directory.
 */
export async function exportToPacEngine(
  options: PacEngineExportOptions
): Promise<string> {
  const exportDir = path.join(
    process.cwd(),
    "exports",
    options.projectId,
    Date.now().toString()
  );

  await fs.mkdir(exportDir, { recursive: true });

  const pacdata        = buildPacData(options);
  const visualManifest = buildVisualManifest(options);

  await Promise.all([
    fs.writeFile(
      path.join(exportDir, "world.pacdata.json"),
      JSON.stringify(pacdata, null, 2)
    ),
    fs.writeFile(
      path.join(exportDir, "visual_manifest.json"),
      JSON.stringify(visualManifest, null, 2)
    ),
    // Phase M3: copy or symlink glTF assets into exportDir/assets/
  ]);

  return exportDir;
}
