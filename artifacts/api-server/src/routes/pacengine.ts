import { Router, type IRouter, type Request, type Response } from "express";
import {
  ListProjectsResponse,
  GetProjectParams,
  GetProjectResponse,
  ImportProjectBody,
  ImportProjectResponse,
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
} from "@workspace/api-zod";
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
  EngineUnavailableError,
  EngineRunFailedError,
  type EngineRunArtifacts,
} from "../lib/engine-runner";
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
      });
      const completedAt = new Date();
      const data = RunProjectResponse.parse({
        projectId: project.id,
        ticks: body.ticks,
        run: artifacts,
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
      });
      const runB = await runEngine({
        pacdataFile: project.filePath,
        ticks: body.ticks,
        runLabel: `${project.id}_detB`,
      });
      const completedAt = new Date();
      const eventsMatch = runA.eventLogSha256 === runB.eventLogSha256;
      const traceMatch = runA.traceSha256 === runB.traceSha256;
      const diffLines = computeDiff(runA, runB);
      const data = DeterminismCheckResponse.parse({
        projectId: project.id,
        ticks: body.ticks,
        runA,
        runB,
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
    engineVersion: "0.0.4",
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
