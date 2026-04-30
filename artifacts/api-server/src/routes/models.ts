import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { db, modelsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListModelsResponse,
  RegisterModelBody,
  GenerateMeshyModelBody,
  PollMeshyJobParams,
  PollMeshyJobResponse,
  GenerateBlendergptModelBody,
  PollBlendergptJobParams,
  PollBlendergptJobResponse,
  GetModelParams,
  GetModelResponse,
  DeleteModelParams,
} from "@workspace/api-zod";
import { objectStorageClient } from "../lib/objectStorage";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MESHY_BASE = "https://api.meshy.ai/v2";
const BLENDERGPT_BASE = "https://api.blendergpt.ai/v1";

function getMeshyKey(): string {
  const key = process.env["MESHY_API_KEY"];
  if (!key) throw new ApiKeyMissingError("Meshy.ai");
  return key;
}

function getBlendergptKey(): string {
  const key = process.env["BLENDERGPT_API_KEY"];
  if (!key) throw new ApiKeyMissingError("BlenderGPT");
  return key;
}

class ApiKeyMissingError extends Error {
  constructor(public service: string) {
    super(`${service} API key is not configured. Please set the required secret in project settings.`);
    this.name = "ApiKeyMissingError";
  }
}

function getPrivateObjectDir(): string {
  const dir = process.env["PRIVATE_OBJECT_DIR"] ?? "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  return dir;
}

function parsePath(path: string): { bucketName: string; objectName: string } {
  let normalized = path;
  if (normalized.startsWith("gs://")) normalized = normalized.slice(5);
  else if (normalized.startsWith("https://storage.googleapis.com/")) {
    normalized = normalized.slice("https://storage.googleapis.com/".length);
  }
  const slash = normalized.indexOf("/");
  if (slash === -1) return { bucketName: normalized, objectName: "" };
  return {
    bucketName: normalized.slice(0, slash),
    objectName: normalized.slice(slash + 1),
  };
}

async function uploadBufferToGcs(
  buffer: Buffer,
  contentType: string,
  suffix: string,
): Promise<string> {
  const dir = getPrivateObjectDir().replace(/\/$/, "");
  const objectId = `${randomUUID()}${suffix}`;
  const fullPath = `${dir}/uploads/${objectId}`;
  const { bucketName, objectName } = parsePath(fullPath);
  const file = objectStorageClient.bucket(bucketName).file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/uploads/${objectId}`;
}

async function fetchAndUploadGlb(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch model from ${url}: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  return uploadBufferToGcs(buf, "model/gltf-binary", ".glb");
}

router.use(requireAuth);

router.get("/models", async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const rows = await db
    .select()
    .from(modelsTable)
    .where(eq(modelsTable.userId, userId))
    .orderBy(modelsTable.createdAt);

  res.json(ListModelsResponse.parse({ models: rows }));
});

router.post("/models/register", async (req: Request, res: Response) => {
  const parsed = RegisterModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.message });
    return;
  }
  const { name, storageKey, thumbnailUrl } = parsed.data;
  const userId = req.user!.id;
  const id = randomUUID();

  const [model] = await db
    .insert(modelsTable)
    .values({ id, userId, name, source: "upload", storageKey, thumbnailUrl })
    .returning();

  res.status(201).json({ model });
});

router.post("/models/generate/meshy", async (req: Request, res: Response) => {
  try {
    const key = getMeshyKey();
    const parsed = GenerateMeshyModelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.message });
      return;
    }
    const { prompt, artStyle = "realistic", negativePrompt } = parsed.data;

    const meshyResp = await fetch(`${MESHY_BASE}/text-3d`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "preview",
        prompt,
        art_style: artStyle,
        negative_prompt: negativePrompt,
      }),
    });

    if (!meshyResp.ok) {
      const err = await meshyResp.text();
      req.log.error({ status: meshyResp.status, err }, "Meshy API error");
      res.status(502).json({ error: `Meshy.ai error: ${err}` });
      return;
    }

    const { result: jobId } = (await meshyResp.json()) as { result: string };

    res.status(202).json({ jobId, status: "PENDING" });
  } catch (err) {
    if (err instanceof ApiKeyMissingError) {
      res.status(503).json({ error: err.message });
      return;
    }
    logger.error({ err }, "Meshy generate error");
    res.status(500).json({ error: "Failed to start Meshy generation" });
  }
});

router.get("/models/generate/meshy/:jobId", async (req: Request, res: Response) => {
  try {
    const params = PollMeshyJobParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid jobId" });
      return;
    }
    const { jobId } = params.data;
    const key = getMeshyKey();

    const pollResp = await fetch(`${MESHY_BASE}/text-3d/${jobId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!pollResp.ok) {
      const err = await pollResp.text();
      res.status(502).json({ error: `Meshy.ai poll error: ${err}` });
      return;
    }

    const data = (await pollResp.json()) as {
      id: string;
      status: string;
      progress: number;
      model_urls?: { glb?: string };
      thumbnail_url?: string;
    };

    if (data.status === "SUCCEEDED" && data.model_urls?.glb) {
      const userId = req.user!.id;

      const existing = await db
        .select()
        .from(modelsTable)
        .where(and(eq(modelsTable.userId, userId), eq(modelsTable.meshyJobId, jobId)))
        .limit(1);

      if (existing.length > 0) {
        const response = PollMeshyJobResponse.parse({
          jobId,
          status: "SUCCEEDED",
          progress: 100,
          modelUrl: `/api/storage${existing[0].storageKey}`,
          thumbnailUrl: existing[0].thumbnailUrl,
          model: existing[0],
        });
        res.json(response);
        return;
      }

      const storageKey = await fetchAndUploadGlb(data.model_urls.glb);
      const id = randomUUID();
      const promptSlug = jobId.slice(0, 8);

      const [model] = await db
        .insert(modelsTable)
        .values({
          id,
          userId,
          name: `Meshy-${promptSlug}`,
          source: "meshy",
          storageKey,
          thumbnailUrl: data.thumbnail_url ?? null,
          meshyJobId: jobId,
        })
        .returning();

      const response = PollMeshyJobResponse.parse({
        jobId,
        status: "SUCCEEDED",
        progress: 100,
        modelUrl: `/api/storage${storageKey}`,
        thumbnailUrl: data.thumbnail_url ?? null,
        model,
      });
      res.json(response);
      return;
    }

    const response = PollMeshyJobResponse.parse({
      jobId,
      status: data.status as "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "EXPIRED",
      progress: data.progress ?? 0,
      modelUrl: null,
      thumbnailUrl: data.thumbnail_url ?? null,
      model: null,
    });
    res.json(response);
  } catch (err) {
    if (err instanceof ApiKeyMissingError) {
      res.status(503).json({ error: err.message });
      return;
    }
    logger.error({ err }, "Meshy poll error");
    res.status(500).json({ error: "Failed to poll Meshy job" });
  }
});

router.post("/models/generate/blendergpt", async (req: Request, res: Response) => {
  try {
    const key = getBlendergptKey();
    const parsed = GenerateBlendergptModelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.message });
      return;
    }
    const { prompt } = parsed.data;

    const bgResp = await fetch(`${BLENDERGPT_BASE}/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!bgResp.ok) {
      const err = await bgResp.text();
      req.log.error({ status: bgResp.status, err }, "BlenderGPT API error");
      res.status(502).json({ error: `BlenderGPT error: ${err}` });
      return;
    }

    const { job_id: jobId } = (await bgResp.json()) as { job_id: string };
    res.status(202).json({ jobId, status: "PENDING" });
  } catch (err) {
    if (err instanceof ApiKeyMissingError) {
      res.status(503).json({ error: err.message });
      return;
    }
    logger.error({ err }, "BlenderGPT generate error");
    res.status(500).json({ error: "Failed to start BlenderGPT generation" });
  }
});

router.get("/models/generate/blendergpt/:jobId", async (req: Request, res: Response) => {
  try {
    const params = PollBlendergptJobParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid jobId" });
      return;
    }
    const { jobId } = params.data;
    const key = getBlendergptKey();

    const pollResp = await fetch(`${BLENDERGPT_BASE}/generate/${jobId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!pollResp.ok) {
      const err = await pollResp.text();
      res.status(502).json({ error: `BlenderGPT poll error: ${err}` });
      return;
    }

    const data = (await pollResp.json()) as {
      job_id: string;
      status: string;
      progress?: number;
      model_url?: string;
    };

    if (data.status === "SUCCEEDED" && data.model_url) {
      const userId = req.user!.id;

      const existing = await db
        .select()
        .from(modelsTable)
        .where(and(eq(modelsTable.userId, userId), eq(modelsTable.blendergptJobId, jobId)))
        .limit(1);

      if (existing.length > 0) {
        const response = PollBlendergptJobResponse.parse({
          jobId,
          status: "SUCCEEDED",
          progress: 100,
          modelUrl: `/api/storage${existing[0].storageKey}`,
          model: existing[0],
        });
        res.json(response);
        return;
      }

      const storageKey = await fetchAndUploadGlb(data.model_url);
      const id = randomUUID();
      const promptSlug = jobId.slice(0, 8);

      const [model] = await db
        .insert(modelsTable)
        .values({
          id,
          userId,
          name: `BlenderGPT-${promptSlug}`,
          source: "blendergpt",
          storageKey,
          thumbnailUrl: null,
          blendergptJobId: jobId,
        })
        .returning();

      const response = PollBlendergptJobResponse.parse({
        jobId,
        status: "SUCCEEDED",
        progress: 100,
        modelUrl: `/api/storage${storageKey}`,
        model,
      });
      res.json(response);
      return;
    }

    const response = PollBlendergptJobResponse.parse({
      jobId,
      status: data.status as "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED",
      progress: data.progress ?? null,
      modelUrl: null,
      model: null,
    });
    res.json(response);
  } catch (err) {
    if (err instanceof ApiKeyMissingError) {
      res.status(503).json({ error: err.message });
      return;
    }
    logger.error({ err }, "BlenderGPT poll error");
    res.status(500).json({ error: "Failed to poll BlenderGPT job" });
  }
});

router.get("/models/:modelId", async (req: Request, res: Response) => {
  const params = GetModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid modelId" });
    return;
  }
  const { modelId } = params.data;
  const userId = req.user!.id;

  const [model] = await db
    .select()
    .from(modelsTable)
    .where(and(eq(modelsTable.id, modelId), eq(modelsTable.userId, userId)))
    .limit(1);

  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  res.json(GetModelResponse.parse({ model }));
});

router.delete("/models/:modelId", async (req: Request, res: Response) => {
  const params = DeleteModelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid modelId" });
    return;
  }
  const { modelId } = params.data;
  const userId = req.user!.id;

  const deleted = await db
    .delete(modelsTable)
    .where(and(eq(modelsTable.id, modelId), eq(modelsTable.userId, userId)))
    .returning();

  if (deleted.length === 0) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  res.status(204).end();
});

export default router;
