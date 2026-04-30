import path from "node:path";
import { Router, type IRouter } from "express";
import {
  GetRendererStatusResponse,
  InitializeRendererBody,
  InitializeRendererResponse,
  RendererImportExportBody,
  RendererImportExportResponse,
  RendererResizeBody,
  RendererUpdateStateBody,
  RendererSetCameraBody,
  SimulationStepBody,
  SimulationStepResponse,
  SimulationSnapshotResponse,
  SimulationStartTickBody,
  SimulationTickControlResponse,
} from "@workspace/api-zod";
import {
  rendererInitialize,
  rendererShutdown,
  rendererFrame,
  rendererImportExport,
  rendererResize,
  rendererSetCamera,
  rendererUpdateSimulationState,
  rendererStatus,
  rendererStartTick,
  rendererStopTick,
  rendererSimulationStep,
  rendererGetEntitySnapshot,
  WORKSPACE_ROOT,
} from "../lib/renderer-bridge";

const router: IRouter = Router();

function isAllowedFolderPath(folderPath: string): boolean {
  const resolved = path.resolve(folderPath);
  return resolved.startsWith(WORKSPACE_ROOT + path.sep) || resolved === WORKSPACE_ROOT;
}

router.get("/renderer/status", (_req, res) => {
  res.json(GetRendererStatusResponse.parse(rendererStatus()));
});

router.post("/renderer/initialize", (req, res) => {
  const body   = InitializeRendererBody.parse(req.body);
  const result = rendererInitialize(body.width, body.height);
  res.json(InitializeRendererResponse.parse(result));
});

router.delete("/renderer/shutdown", (_req, res) => {
  rendererShutdown();
  res.status(204).end();
});

router.post("/renderer/frame", (_req, res) => {
  res.json(rendererFrame());
});

router.post("/renderer/import-export", (req, res) => {
  const body = RendererImportExportBody.parse(req.body);
  if (!isAllowedFolderPath(body.folderPath)) {
    res.status(400).json({ error: "Invalid folderPath", details: "Path must be within the workspace" });
    return;
  }
  if (!rendererStatus().initialized) {
    res.status(409).json({ error: "Renderer not initialized", details: "Call POST /renderer/initialize first" });
    return;
  }
  const result = rendererImportExport(body.folderPath);
  res.json(RendererImportExportResponse.parse(result));
});

router.post("/renderer/resize", (req, res) => {
  const body = RendererResizeBody.parse(req.body);
  rendererResize(body.width, body.height);
  res.status(204).end();
});

router.post("/renderer/update-state", (req, res) => {
  if (!rendererStatus().initialized) {
    res.status(409).json({ error: "Renderer not initialized" });
    return;
  }
  const body = RendererUpdateStateBody.parse(req.body);
  rendererUpdateSimulationState(body.entityCount, body.tickIndex);
  res.status(204).end();
});

router.post("/renderer/set-camera", (req, res) => {
  const body = RendererSetCameraBody.parse(req.body);
  const pos    = body.position as [number, number, number];
  const target = body.target   as [number, number, number];
  rendererSetCamera(pos, target, body.fov ?? 60);
  res.status(204).end();
});

// ─── M3 Simulation tick routes ────────────────────────────────────────────────

router.post("/renderer/simulation/start", (req, res) => {
  const body   = SimulationStartTickBody.parse(req.body);
  const result = rendererStartTick(body.hz);
  res.json(SimulationTickControlResponse.parse(result));
});

router.post("/renderer/simulation/stop", (_req, res) => {
  const result = rendererStopTick();
  res.json(SimulationTickControlResponse.parse(result));
});

router.post("/renderer/simulation/step", (req, res) => {
  const body   = SimulationStepBody.parse(req.body);
  const result = rendererSimulationStep(body.dt);
  res.json(SimulationStepResponse.parse(result));
});

router.get("/renderer/simulation/snapshot", (_req, res) => {
  const result = rendererGetEntitySnapshot();
  res.json(SimulationSnapshotResponse.parse(result));
});

export default router;
