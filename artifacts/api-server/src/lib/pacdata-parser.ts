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

  // Accept pacdata_version, version, or format (v7 uses "format": "pacai_pacdata_v7")
  const pacdataVersion =
    stringField(root, "pacdata_version", "") ||
    stringField(root, "version", "") ||
    stringField(root, "format", "");

  // Accept paccore_version (snake_case) or pacCoreVersion (camelCase, v7)
  const paccoreVersion =
    stringField(root, "paccore_version", "") ||
    stringField(root, "pacCoreVersion", "");

  // world block is optional in v7 (entities/conflictSim may be top-level)
  const worldRaw = root["world"];
  const world =
    worldRaw && typeof worldRaw === "object" && !Array.isArray(worldRaw)
      ? (worldRaw as Record<string, unknown>)
      : {};

  const worldName = stringField(world, "name", "");

  // Entities: look under world.entities first, then top-level entities (v7)
  const hasWorldEntities = Array.isArray(world["entities"]);
  const hasRootEntities = Array.isArray(root["entities"]);
  if (!hasWorldEntities && !hasRootEntities) {
    const e = new Error(
      "Expected world.entities or top-level entities array",
    ) as PacDataParseError;
    e.detail =
      'No "entities" array found at world.entities or at the document root';
    throw e;
  }
  const rawEntities = hasWorldEntities
    ? (world["entities"] as unknown[])
    : (root["entities"] as unknown[]);

  const entities: PacDataEntity[] = [];
  for (let idx = 0; idx < rawEntities.length; idx++) {
    const item = rawEntities[idx];
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const idVal = obj["id"];
    let id: string;
    if (typeof idVal === "string") {
      id = idVal;
    } else if (typeof idVal === "number") {
      id = String(idVal);
    } else {
      const e = new Error("Entity id must be a string or number") as PacDataParseError;
      e.detail = `entities[${idx}].id is ${idVal === undefined ? "missing" : `of type ${typeof idVal}`}`;
      throw e;
    }
    const typeVal = obj["type"];
    const type = typeof typeVal === "string" ? typeVal : "entity";
    entities.push({ id, type });
  }

  // conflictSim: look under world.conflict_sim (snake_case) OR top-level conflictSim (camelCase, v7)
  let rawConflict: Record<string, unknown> = {};
  if (world["conflict_sim"] && typeof world["conflict_sim"] === "object") {
    rawConflict = world["conflict_sim"] as Record<string, unknown>;
  } else if (root["conflictSim"] && typeof root["conflictSim"] === "object") {
    const cs = root["conflictSim"] as Record<string, unknown>;
    // camelCase scenarios array is the same field name
    rawConflict = cs;
  }

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
