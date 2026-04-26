import fs from "node:fs/promises";
import path from "node:path";
import { EXAMPLES_DIR } from "./pacengine-paths";
import {
  parsePacData,
  deterministicAccentColor,
  type PacDataDocument,
} from "./pacdata-parser";

export interface LoadedProject {
  id: string;
  filename: string;
  filePath: string;
  fileSizeBytes: number;
  modifiedAt: Date;
  rawJson: string;
  doc: PacDataDocument;
  accentColor: string;
}

const SUFFIX = ".pacdata.json";

export async function ensureExamplesDir(): Promise<void> {
  await fs.mkdir(EXAMPLES_DIR, { recursive: true });
}

export async function listProjectFiles(): Promise<string[]> {
  await ensureExamplesDir();
  const entries = await fs.readdir(EXAMPLES_DIR);
  return entries.filter((f) => f.endsWith(SUFFIX)).sort();
}

export function projectIdFromFilename(filename: string): string {
  return filename.replace(SUFFIX, "");
}

export function filenameFromProjectId(id: string): string {
  return `${id}${SUFFIX}`;
}

export function sanitizeProjectId(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return cleaned || "untitled";
}

export async function loadProjectById(id: string): Promise<LoadedProject | null> {
  const filename = filenameFromProjectId(id);
  const filePath = path.join(EXAMPLES_DIR, filename);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return null;
  }
  const rawJson = await fs.readFile(filePath, "utf8");
  const doc = parsePacData(rawJson);
  return {
    id,
    filename,
    filePath,
    fileSizeBytes: stat.size,
    modifiedAt: stat.mtime,
    rawJson,
    doc,
    accentColor: deterministicAccentColor(id),
  };
}

export async function loadAllProjects(): Promise<LoadedProject[]> {
  const filenames = await listProjectFiles();
  const out: LoadedProject[] = [];
  for (const filename of filenames) {
    const id = projectIdFromFilename(filename);
    try {
      const project = await loadProjectById(id);
      if (project) out.push(project);
    } catch {
      // Skip files that fail to parse so the workspace browser stays usable.
    }
  }
  return out;
}

export async function writeProjectFile(
  id: string,
  rawJson: string,
): Promise<LoadedProject> {
  await ensureExamplesDir();
  const filename = filenameFromProjectId(id);
  const filePath = path.join(EXAMPLES_DIR, filename);
  // Validate before writing so we never persist bad PacData.
  parsePacData(rawJson);
  await fs.writeFile(filePath, rawJson, "utf8");
  const project = await loadProjectById(id);
  if (!project) {
    throw new Error("Project disappeared after write");
  }
  return project;
}

export function toProjectSummary(p: LoadedProject) {
  return {
    id: p.id,
    name: p.id,
    filename: p.filename,
    worldName: p.doc.worldName,
    pacdataVersion: p.doc.pacdataVersion,
    paccoreVersion: p.doc.paccoreVersion,
    entityCount: p.doc.entities.length,
    agentCount: p.doc.agentCount,
    conflictSimEnabled: p.doc.conflictSim.enabled,
    scenarioCount: p.doc.conflictSim.scenarios.length,
    fileSizeBytes: p.fileSizeBytes,
    modifiedAt: p.modifiedAt.toISOString(),
    accentColor: p.accentColor,
  };
}
