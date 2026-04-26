import path from "node:path";
import fs from "node:fs";

function findWorkspaceRoot(): string {
  const fromEnv = process.env["PACENGINE_WORKSPACE_ROOT"];
  if (fromEnv) return fromEnv;

  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "pacengine", "examples"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const WORKSPACE_ROOT: string = findWorkspaceRoot();
export const PACENGINE_ROOT: string = path.join(WORKSPACE_ROOT, "pacengine");
export const EXAMPLES_DIR: string = path.join(PACENGINE_ROOT, "examples");
export const ENGINE_BINARY: string = path.join(
  PACENGINE_ROOT,
  "build",
  "game",
  "pacengine_game",
);
export const RUNS_DIR: string = path.join(PACENGINE_ROOT, ".editor-runs");
