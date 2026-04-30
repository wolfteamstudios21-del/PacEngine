import { Router, type IRouter } from "express";
import {
  GetRendererStatusResponse,
  InitializeRendererBody,
  InitializeRendererResponse,
  RendererImportExportBody,
  RendererImportExportResponse,
  RendererResizeBody,
} from "@workspace/api-zod";
import {
  rendererInitialize,
  rendererShutdown,
  rendererImportExport,
  rendererResize,
  rendererStatus,
} from "../lib/renderer-bridge";

const router: IRouter = Router();

// GET /renderer/status
router.get("/renderer/status", (_req, res) => {
  const data = GetRendererStatusResponse.parse(rendererStatus());
  res.json(data);
});

// POST /renderer/initialize
router.post("/renderer/initialize", (req, res) => {
  const body = InitializeRendererBody.parse(req.body);
  const result = rendererInitialize(body.width, body.height);
  const data = InitializeRendererResponse.parse(result);
  res.json(data);
});

// DELETE /renderer/shutdown
router.delete("/renderer/shutdown", (_req, res) => {
  rendererShutdown();
  res.status(204).end();
});

// POST /renderer/import-export
router.post("/renderer/import-export", (req, res) => {
  const status = rendererStatus();
  if (!status.initialized) {
    res.status(409).json({ error: "Renderer not initialized", details: "Call POST /renderer/initialize first" });
    return;
  }
  const body = RendererImportExportBody.parse(req.body);
  const result = rendererImportExport(body.folderPath);
  const data = RendererImportExportResponse.parse(result);
  res.json(data);
});

// POST /renderer/resize
router.post("/renderer/resize", (req, res) => {
  const body = RendererResizeBody.parse(req.body);
  rendererResize(body.width, body.height);
  res.status(204).end();
});

export default router;
