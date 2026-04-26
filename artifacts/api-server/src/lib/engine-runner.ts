import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ENGINE_BINARY, RUNS_DIR } from "./pacengine-paths";

export interface EngineRunArtifacts {
  durationMs: number;
  eventLines: string[];
  eventLineCount: number;
  traceBytes: number;
  traceSha256: string;
  eventLogSha256: string;
}

export interface EngineRunOptions {
  pacdataFile: string;
  ticks: number;
  runLabel: string;
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

export async function runEngine(
  opts: EngineRunOptions,
): Promise<EngineRunArtifacts> {
  await ensureEngineAvailable();
  await fs.mkdir(RUNS_DIR, { recursive: true });

  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const baseName = `${opts.runLabel}_${stamp}`;
  const tracePath = path.join(RUNS_DIR, `${baseName}.trace`);
  const eventLogPath = path.join(RUNS_DIR, `${baseName}.events.log`);

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

  const [traceBuf, eventBuf] = await Promise.all([
    fs.readFile(tracePath),
    fs.readFile(eventLogPath),
  ]);

  const eventText = eventBuf.toString("utf8");
  const eventLines = eventText.split("\n").filter((l) => l.length > 0);

  const result: EngineRunArtifacts = {
    durationMs,
    eventLines,
    eventLineCount: eventLines.length,
    traceBytes: traceBuf.byteLength,
    traceSha256: sha256(traceBuf),
    eventLogSha256: sha256(eventBuf),
  };

  // Cleanup so .editor-runs/ doesn't accumulate forever.
  await safeUnlink(tracePath);
  await safeUnlink(eventLogPath);

  return result;
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
