import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ENGINE_BINARY, RUNS_DIR } from "./pacengine-paths";

export interface EngineRunArtifacts {
  runId: string;
  durationMs: number;
  eventLines: string[];
  eventLineCount: number;
  traceBytes: number;
  traceVersion: number;
  traceSha256: string;
  eventLogSha256: string;
  // Filesystem locations of the persisted artifacts. Kept on disk so
  // the editor's frame/diff endpoints can re-open them without
  // re-running the engine.
  tracePath: string;
  eventLogPath: string;
}

export interface EngineRunOptions {
  pacdataFile: string;
  ticks: number;
  runLabel: string;
  projectId: string;
}

export interface PersistedRun {
  runId: string;
  projectId: string;
  ticks: number;
  traceVersion: number;
  traceBytes: number;
  traceSha256: string;
  eventLogSha256?: string;
  completedAt: string;
}

export class EngineUnavailableError extends Error {
  constructor() {
    super(
      `pacengine_game binary not found at ${ENGINE_BINARY}. Build the engine: cmake -S pacengine -B pacengine/build && cmake --build pacengine/build`,
    );
  }
}

export class EngineRunFailedError extends Error {
  exitCode: number;
  stderr: string;
  constructor(exitCode: number, stderr: string) {
    super(`pacengine_game exited with code ${exitCode}: ${stderr.slice(0, 500)}`);
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

async function ensureEngineAvailable(): Promise<void> {
  try {
    await fs.access(ENGINE_BINARY, fs.constants.X_OK);
  } catch {
    throw new EngineUnavailableError();
  }
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function generateRunId(projectId: string): string {
  // Short, sortable, collision-resistant. Never persisted as the
  // canonical identity of a run beyond the editor session, so we don't
  // need full UUIDs.
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString("hex");
  return `${projectId}-${stamp}-${rand}`;
}

export function tracePathFor(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.trace`);
}

export function eventLogPathFor(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.events.log`);
}

export function metadataPathFor(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.json`);
}

export async function loadRunMetadata(
  runId: string,
): Promise<PersistedRun | null> {
  try {
    const buf = await fs.readFile(metadataPathFor(runId), "utf8");
    return JSON.parse(buf) as PersistedRun;
  } catch {
    return null;
  }
}

export async function runEngine(
  opts: EngineRunOptions,
): Promise<EngineRunArtifacts> {
  await ensureEngineAvailable();
  await fs.mkdir(RUNS_DIR, { recursive: true });

  const runId = generateRunId(opts.projectId);
  const tracePath = tracePathFor(runId);
  const eventLogPath = eventLogPathFor(runId);

  const args = [
    opts.pacdataFile,
    String(opts.ticks),
    "--trace",
    tracePath,
    "--event-log",
    eventLogPath,
  ];

  const startedAt = Date.now();
  const { exitCode, stderr } = await new Promise<{
    exitCode: number;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(ENGINE_BINARY, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderrBuf = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (d) => {
      stderrBuf += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? -1, stderr: stderrBuf });
    });
  });
  const durationMs = Date.now() - startedAt;

  if (exitCode !== 0) {
    await safeUnlink(tracePath);
    await safeUnlink(eventLogPath);
    throw new EngineRunFailedError(exitCode, stderr);
  }

  // Event log may legitimately be empty (when ConflictSim is disabled
  // or a project has no agents). Treat ENOENT as empty rather than an
  // error so the editor can still scrub the trace frames.
  const traceBuf = await fs.readFile(tracePath);
  let eventBuf: Buffer = Buffer.alloc(0);
  try {
    eventBuf = await fs.readFile(eventLogPath);
  } catch {
    eventBuf = Buffer.alloc(0);
  }

  const eventText = eventBuf.toString("utf8");
  const eventLines = eventText.split("\n").filter((l) => l.length > 0);

  // Read the trace v2 header version directly. parseTraceV2 will be
  // called lazily by the frames endpoint; we only need the version
  // here so the metadata advertises it.
  const traceVersion =
    traceBuf.length >= 6 && traceBuf.subarray(0, 4).toString("ascii") === "PACT"
      ? traceBuf.readUInt16LE(4)
      : 1;

  const meta: PersistedRun = {
    runId,
    projectId: opts.projectId,
    ticks: opts.ticks,
    traceVersion,
    traceBytes: traceBuf.byteLength,
    traceSha256: sha256(traceBuf),
    eventLogSha256: sha256(eventBuf),
    completedAt: new Date().toISOString(),
  };
  await fs.writeFile(metadataPathFor(runId), JSON.stringify(meta), "utf8");

  return {
    runId,
    durationMs,
    eventLines,
    eventLineCount: eventLines.length,
    traceBytes: traceBuf.byteLength,
    traceVersion,
    traceSha256: meta.traceSha256,
    eventLogSha256: meta.eventLogSha256 ?? "",
    tracePath,
    eventLogPath,
  };
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch {
    // ignore
  }
}

export async function getEngineStatus(): Promise<{
  binaryAvailable: boolean;
  binaryPath: string;
}> {
  try {
    await fs.access(ENGINE_BINARY, fs.constants.X_OK);
    return { binaryAvailable: true, binaryPath: ENGINE_BINARY };
  } catch {
    return { binaryAvailable: false, binaryPath: ENGINE_BINARY };
  }
}
