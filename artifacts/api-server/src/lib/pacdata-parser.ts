export interface PacDataEntity {
  id: string;
  type: string;
}

export interface PacDataScenario {
  id: string;
}

export interface PacDataConflictSim {
  enabled: boolean;
  scenarios: PacDataScenario[];
}

export interface PacDataDocument {
  pacdataVersion: string;
  paccoreVersion: string;
  worldName: string;
  entities: PacDataEntity[];
  conflictSim: PacDataConflictSim;
  agentCount: number;
}

export interface PacDataParseError extends Error {
  detail: string;
}

export function parsePacData(raw: string): PacDataDocument {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    const e = new Error("PacData JSON parse failed") as PacDataParseError;
    e.detail = err instanceof Error ? err.message : String(err);
    throw e;
  }

  if (!json || typeof json !== "object") {
    const e = new Error("PacData root must be an object") as PacDataParseError;
    e.detail = "Root JSON value is not an object";
    throw e;
  }
  const root = json as Record<string, unknown>;

  const pacdataVersion = stringField(root, "pacdata_version", "");
  const paccoreVersion = stringField(root, "paccore_version", "");

  const world = (root["world"] ?? {}) as Record<string, unknown>;
  if (typeof world !== "object" || world === null) {
    const e = new Error("PacData.world must be an object") as PacDataParseError;
    e.detail = "world key is missing or not an object";
    throw e;
  }
  const worldName = stringField(world, "name", "");

  const rawEntities = Array.isArray(world["entities"]) ? world["entities"] : [];
  const entities: PacDataEntity[] = [];
  for (const item of rawEntities) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const idVal = obj["id"];
    let id: string;
    if (typeof idVal === "string") id = idVal;
    else if (typeof idVal === "number") id = String(idVal);
    else continue;
    const typeVal = obj["type"];
    const type = typeof typeVal === "string" ? typeVal : "entity";
    entities.push({ id, type });
  }

  const rawConflict = (world["conflict_sim"] ?? {}) as Record<string, unknown>;
  const enabled = rawConflict["enabled"] === true;
  const rawScenarios = Array.isArray(rawConflict["scenarios"])
    ? rawConflict["scenarios"]
    : [];
  const scenarios: PacDataScenario[] = [];
  for (const s of rawScenarios) {
    if (!s || typeof s !== "object") continue;
    const obj = s as Record<string, unknown>;
    const idVal = obj["id"];
    if (typeof idVal === "string") scenarios.push({ id: idVal });
    else if (typeof idVal === "number") scenarios.push({ id: String(idVal) });
  }

  const agentCount = entities.filter((e) => e.type === "agent").length;

  return {
    pacdataVersion,
    paccoreVersion,
    worldName,
    entities,
    conflictSim: { enabled, scenarios },
    agentCount,
  };
}

function stringField(
  obj: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const v = obj[key];
  return typeof v === "string" ? v : fallback;
}

export function deterministicAccentColor(seed: string): string {
  // Stable HSL string derived from seed; avoids any randomness.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 78%, 58%)`;
}
