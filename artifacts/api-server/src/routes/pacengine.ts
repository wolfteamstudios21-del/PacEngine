import { Router, type IRouter, type Request, type Response } from "express";
import fs from "node:fs/promises";
import {
  ListProjectsResponse,
  GetProjectParams,
  GetProjectResponse,
  ImportProjectBody,
  ImportProjectResponse,
  ImportPacExportBody,
  RunProjectParams,
  RunProjectBody,
  RunProjectResponse,
  DeterminismCheckParams,
  DeterminismCheckBody,
  DeterminismCheckResponse,
  ListTemplatesResponse,
  InstantiateTemplateParams,
  InstantiateTemplateBody,
  InstantiateTemplateResponse,
  GetStatsResponse,
  GetEngineInfoResponse,
  GetRunParams,
  GetRunResponse,
  GetRunFramesParams,
  GetRunFramesQueryParams,
  GetRunFramesResponse,
  DiffRunsParams,
  DiffRunsResponse,
  AddProjectMeshParams,
  AddProjectMeshBody,
  AddProjectMeshResponse,
  UpdateVisualManifestParams,
  UpdateVisualManifestBody,
  UpdateVisualManifestResponse,
} from "@workspace/api-zod";
import { parseVisualManifest, VisualManifestParseError, writeVisualManifest, loadVisualManifest } from "../lib/visual-manifest";
import {
  loadAllProjects,
  loadProjectById,
  writeProjectFile,
  sanitizeProjectId,
  toProjectSummary,
} from "../lib/projects-fs";
import {
  runEngine,
  getEngineStatus,
  loadRunMetadata,
  tracePathFor,
  EngineUnavailableError,
  EngineRunFailedError,
  type EngineRunArtifacts,
} from "../lib/engine-runner";
import { parseTraceV2, TraceParseError } from "../lib/trace-reader";
import { diffTraces } from "../lib/trace-diff";
import { TEMPLATES, getTemplate, templateToApi } from "../lib/templates";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/pacengine/projects", async (_req, res) => {
  const projects = await loadAllProjects();
  const data = ListProjectsResponse.parse({
    projects: projects.map(toProjectSummary),
  });
  res.json(data);
});

router.get(
  "/pacengine/projects/:projectId",
  async (req: Request, res: Response) => {
    const params = GetProjectParams.parse(req.params);
    const project = await loadProjectById(params.projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const data = GetProjectResponse.parse({
      summary: toProjectSummary(project),
      entities: project.doc.entities,
      conflictSim: project.doc.conflictSim,
      rawJson: project.rawJson,
      ...(project.visualManifest ? { visualManifest: project.visualManifest } : {}),
    });
    res.json(data);
  },
);

router.post("/pacengine/projects/import", async (req: Request, res: Response) => {
  const body = ImportProjectBody.parse(req.body);
  const id = sanitizeProjectId(body.name);
  try {
    const project = await writeProjectFile(id, body.rawJson);
    const data = ImportProjectResponse.parse({
      project: toProjectSummary(project),
    });
    res.json(data);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: "Invalid PacData document", details: detail });
  }
});

router.post(
  "/pacengine/projects/import-pacexport",
  async (req: Request, res: Response) => {
    const body = ImportPacExportBody.parse(req.body);
    const id = sanitizeProjectId(body.name);

    let visualManifest = null;
    if (body.visualManifestJson) {
      try {
        visualManifest = parseVisualManifest(body.visualManifestJson);
      } catch (err) {
        const detail =
          err instanceof VisualManifestParseError
            ? `${err.message}: ${err.detail}`
            : String(err);
        res
          .status(400)
          .json({ error: "Invalid visual_manifest.json", details: detail });
        return;
      }
    }

    try {
      const project = await writeProjectFile(
        id,
        body.worldPacdataJson,
        visualManifest,
      );
      const data = ImportProjectResponse.parse({
        project: toProjectSummary(project),
      });
      res.json(data);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      res
        .status(400)
        .json({ error: "Invalid world.pacdata.json", details: detail });
    }
  },
);

router.post(
  "/pacengine/projects/:projectId/runs",
  async (req: Request, res: Response) => {
    const params = RunProjectParams.parse(req.params);
    const body = RunProjectBody.parse(req.body);
    const project = await loadProjectById(params.projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const startedAt = new Date();
    try {
      const artifacts = await runEngine({
        pacdataFile: project.filePath,
        ticks: body.ticks,
        runLabel: `${project.id}_run`,
        projectId: project.id,
      });
      const completedAt = new Date();
      const data = RunProjectResponse.parse({
        runId: artifacts.runId,
        projectId: project.id,
        ticks: body.ticks,
        run: toRunResultPayload(artifacts),
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
      });
      res.json(data);
    } catch (err) {
      handleEngineError(res, err);
    }
  },
);

router.post(
  "/pacengine/projects/:projectId/determinism-check",
  async (req: Request, res: Response) => {
    const params = DeterminismCheckParams.parse(req.params);
    const body = DeterminismCheckBody.parse(req.body);
    const project = await loadProjectById(params.projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const startedAt = new Date();
    try {
      const runA = await runEngine({
        pacdataFile: project.filePath,
        ticks: body.ticks,
        runLabel: `${project.id}_detA`,
        projectId: project.id,
      });
      const runB = await runEngine({
        pacdataFile: project.filePath,
        ticks: body.ticks,
        runLabel: `${project.id}_detB`,
        projectId: project.id,
      });
      const completedAt = new Date();
      const eventsMatch = runA.eventLogSha256 === runB.eventLogSha256;
      const traceMatch = runA.traceSha256 === runB.traceSha256;
      const diffLines = computeDiff(runA, runB);
      const data = DeterminismCheckResponse.parse({
        projectId: project.id,
        ticks: body.ticks,
        runA: toRunResultPayload(runA),
        runB: toRunResultPayload(runB),
        runAId: runA.runId,
        runBId: runB.runId,
        eventsMatch,
        traceMatch,
        diffLines,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
      });
      res.json(data);
    } catch (err) {
      handleEngineError(res, err);
    }
  },
);

// --- Trace-v2 / Replay endpoints ---------------------------------------

router.get("/pacengine/runs/:runId", async (req: Request, res: Response) => {
  const params = GetRunParams.parse(req.params);
  const meta = await loadRunMetadata(params.runId);
  if (!meta) {
    res.status(404).json({ error: "Run not found" });
    return;
  }
  const data = GetRunResponse.parse({
    runId: meta.runId,
    projectId: meta.projectId,
    ticks: meta.ticks,
    traceVersion: meta.traceVersion,
    traceBytes: meta.traceBytes,
    traceSha256: meta.traceSha256,
    eventLogSha256: meta.eventLogSha256,
    completedAt: meta.completedAt,
  });
  res.json(data);
});

router.get(
  "/pacengine/runs/:runId/frames",
  async (req: Request, res: Response) => {
    const params = GetRunFramesParams.parse(req.params);
    const query = GetRunFramesQueryParams.parse(req.query);
    const meta = await loadRunMetadata(params.runId);
    if (!meta) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    let buf: Buffer;
    try {
      buf = await fs.readFile(tracePathFor(params.runId));
    } catch {
      res.status(404).json({ error: "Run trace file missing" });
      return;
    }
    let parsed;
    try {
      parsed = parseTraceV2(buf);
    } catch (err) {
      const detail = err instanceof TraceParseError ? err.message : String(err);
      res.status(500).json({ error: "Failed to parse trace", details: detail });
      return;
    }
    const total = parsed.frames.length;
    const from = clampInt(query.from ?? 0, 0, total);
    const to = clampInt(query.to ?? total, from, total);
    const window = parsed.frames.slice(from, to);
    const data = GetRunFramesResponse.parse({
      runId: params.runId,
      from,
      to,
      totalFrames: total,
      frames: window,
    });
    res.json(data);
  },
);

router.get(
  "/pacengine/runs/:runId/diff/:otherRunId",
  async (req: Request, res: Response) => {
    const params = DiffRunsParams.parse(req.params);
    const [metaA, metaB] = await Promise.all([
      loadRunMetadata(params.runId),
      loadRunMetadata(params.otherRunId),
    ]);
    if (!metaA || !metaB) {
      res.status(404).json({ error: "One or both runs not found" });
      return;
    }
    const [bufA, bufB] = await Promise.all([
      fs.readFile(tracePathFor(params.runId)),
      fs.readFile(tracePathFor(params.otherRunId)),
    ]);
    const outcome = diffTraces(bufA, bufB);
    const data = DiffRunsResponse.parse({
      runAId: params.runId,
      runBId: params.otherRunId,
      identical: outcome.identical,
      firstDivergenceTick: outcome.firstDivergenceTick ?? null,
      entries: outcome.entries,
    });
    res.json(data);
  },
);

router.get("/pacengine/templates", (_req, res) => {
  const data = ListTemplatesResponse.parse({
    templates: TEMPLATES.map(templateToApi),
  });
  res.json(data);
});

router.post(
  "/pacengine/templates/:templateId/instantiate",
  async (req: Request, res: Response) => {
    const params = InstantiateTemplateParams.parse(req.params);
    const body = InstantiateTemplateBody.parse(req.body);
    const template = getTemplate(params.templateId);
    if (!template) {
      res.status(400).json({ error: "Template not found" });
      return;
    }
    const id = sanitizeProjectId(body.name);
    const pacdata = JSON.parse(JSON.stringify(template.pacdata)) as {
      world: { name?: string };
    };
    pacdata.world.name = id;
    const rawJson = JSON.stringify(pacdata, null, 2) + "\n";
    try {
      const project = await writeProjectFile(id, rawJson);
      const data = InstantiateTemplateResponse.parse({
        project: toProjectSummary(project),
      });
      res.json(data);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      res
        .status(400)
        .json({ error: "Failed to instantiate template", details: detail });
    }
  },
);

router.get("/pacengine/stats", async (_req, res) => {
  const projects = await loadAllProjects();
  const totals = projects.reduce(
    (acc, p) => {
      acc.totalEntities += p.doc.entities.length;
      acc.totalAgents += p.doc.agentCount;
      acc.totalScenarios += p.doc.conflictSim.scenarios.length;
      if (p.doc.conflictSim.enabled) acc.conflictSimEnabledCount += 1;
      return acc;
    },
    {
      totalEntities: 0,
      totalAgents: 0,
      totalScenarios: 0,
      conflictSimEnabledCount: 0,
    },
  );
  const byPacdata = bucketBy(projects.map((p) => p.doc.pacdataVersion));
  const byPaccore = bucketBy(projects.map((p) => p.doc.paccoreVersion));
  const data = GetStatsResponse.parse({
    projectCount: projects.length,
    ...totals,
    templateCount: TEMPLATES.length,
    byPacdataVersion: byPacdata,
    byPaccoreVersion: byPaccore,
  });
  res.json(data);
});

router.get("/pacengine/engine-info", async (_req, res) => {
  const status = await getEngineStatus();
  const data = GetEngineInfoResponse.parse({
    binaryAvailable: status.binaryAvailable,
    binaryPath: status.binaryPath,
    engineVersion: "0.0.5",
    pacdataVersion: "1.0.0",
    paccoreVersion: "3.0.0",
  });
  res.json(data);
});

function bucketBy(values: string[]): Array<{ version: string; count: number }> {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v || "(unknown)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => (a.version < b.version ? -1 : 1));
}

function computeDiff(
  a: EngineRunArtifacts,
  b: EngineRunArtifacts,
): Array<{ index: number; runA: string; runB: string }> {
  const out: Array<{ index: number; runA: string; runB: string }> = [];
  const len = Math.max(a.eventLines.length, b.eventLines.length);
  for (let i = 0; i < len && out.length < 50; i++) {
    const av = a.eventLines[i] ?? "";
    const bv = b.eventLines[i] ?? "";
    if (av !== bv) out.push({ index: i, runA: av, runB: bv });
  }
  return out;
}

function toRunResultPayload(a: EngineRunArtifacts) {
  return {
    durationMs: a.durationMs,
    eventLineCount: a.eventLineCount,
    traceBytes: a.traceBytes,
    traceSha256: a.traceSha256,
    eventLogSha256: a.eventLogSha256,
    eventLines: a.eventLines,
  };
}

router.post(
  "/pacengine/projects/:projectId/meshes",
  async (req: Request, res: Response) => {
    const params = AddProjectMeshParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid projectId" });
      return;
    }
    const body = AddProjectMeshBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body", details: body.error.message });
      return;
    }
    const { projectId } = params.data;
    const { modelId, storageKey, name } = body.data;

    const project = await loadProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const existingManifest = await loadVisualManifest(projectId);
    const manifest = existingManifest ?? {
      visual_version: "0.1",
      environment: {},
      global_illumination: {},
      post_processing: {},
      camera_default: {},
    } as any;

    const existing = (manifest as any).art_library_meshes ?? [];
    const updated = [
      ...existing,
      {
        model_id: modelId,
        storage_key: storageKey,
        name: name ?? modelId,
        added_at: new Date().toISOString(),
      },
    ];

    await writeVisualManifest(projectId, { ...manifest, art_library_meshes: updated } as any);

    res.json(
      AddProjectMeshResponse.parse({
        success: true,
        meshCount: updated.length,
      }),
    );
  },
);

// ─── PATCH /projects/:projectId/visual-manifest ──────────────────────────────

router.patch(
  "/projects/:projectId/visual-manifest",
  async (req, res) => {
    const { projectId } = UpdateVisualManifestParams.parse(req.params);

    const project = await loadProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const body = UpdateVisualManifestBody.parse(req.body);

    await writeVisualManifest(projectId, body as any);

    res.json(UpdateVisualManifestResponse.parse(body));
  },
);

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.floor(v);
  if (Number.isNaN(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function handleEngineError(res: Response, err: unknown): void {
  if (err instanceof EngineUnavailableError) {
    logger.warn({ err: err.message }, "Engine binary unavailable");
    res.status(500).json({ error: "Engine unavailable", details: err.message });
    return;
  }
  if (err instanceof EngineRunFailedError) {
    logger.warn({ exitCode: err.exitCode }, "Engine run failed");
    res.status(500).json({ error: "Engine run failed", details: err.stderr });
    return;
  }
  const detail = err instanceof Error ? err.message : String(err);
  logger.error({ err: detail }, "Unexpected engine error");
  res.status(500).json({ error: "Unexpected engine error", details: detail });
}

export default router;
