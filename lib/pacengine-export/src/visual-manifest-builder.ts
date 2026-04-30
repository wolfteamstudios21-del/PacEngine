import type {
  ConflictRecord,
  FactionRecord,
  PacEngineExportOptions,
  VisualManifest,
  VisualEntity,
  MaterialOverride,
} from "./types.js";

// ─── Faction colour palette ───────────────────────────────────────────────────

const FACTION_COLORS: Record<string, [number, number, number, number]> = {
  red:    [0.90, 0.20, 0.20, 1],
  blue:   [0.20, 0.40, 0.90, 1],
  green:  [0.20, 0.75, 0.30, 1],
  yellow: [0.95, 0.85, 0.10, 1],
  purple: [0.65, 0.20, 0.90, 1],
  orange: [0.95, 0.50, 0.10, 1],
  white:  [0.95, 0.95, 0.95, 1],
  black:  [0.10, 0.10, 0.10, 1],
};

function factionColor(
  faction: string,
  factions: FactionRecord[]
): [number, number, number, number] {
  // Look for an explicit colour on the faction record first.
  const record = factions.find(
    (f) => f.id === faction || f.name?.toLowerCase() === faction?.toLowerCase()
  );
  if (record?.color) {
    const key = record.color.toLowerCase().replace(/\s+/g, "");
    if (key in FACTION_COLORS) return FACTION_COLORS[key];
    // Accept hex colours (#RRGGBB).
    const hex = key.replace("#", "");
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return [r, g, b, 1];
    }
  }
  const key = faction?.toLowerCase?.() ?? "";
  return FACTION_COLORS[key] ?? [0.70, 0.70, 0.70, 1];
}

function buildEntityOverride(
  baseColorFactor: [number, number, number, number]
): Record<string, MaterialOverride> {
  return { "0": { baseColorFactor } };
}

function conflictsToEntities(
  conflicts: ConflictRecord[],
  factions: FactionRecord[]
): VisualEntity[] {
  return conflicts.map((conflict, index) => ({
    id: typeof conflict.id === "number" ? conflict.id : index + 1000,
    render: {
      asset: "assets/models/agent.gltf",
      cast_shadows: true,
      receive_shadows: true,
      visible: true,
      material_overrides: buildEntityOverride(
        factionColor(conflict.faction, factions)
      ),
    },
  }));
}

// ─── Public builder ───────────────────────────────────────────────────────────

export function buildVisualManifest(
  options: PacEngineExportOptions
): VisualManifest {
  return {
    visual_version: "1.0.0",
    pacdata_version: "1.1.0",

    environment: {
      sky_type: "physical",
      sun_direction: [0.45, 0.85, 0.35],
      sun_intensity: 1.25,
      sun_color: [1.0, 0.96, 0.88],
      ambient_intensity: 0.35,
      fog_enabled: true,
      fog_density: 0.018,
      fog_color: [0.72, 0.80, 0.95],
      fog_height_falloff: 0.45,
    },

    global_illumination: {
      gi_type: "probe_grid",
      probe_density: "medium",
    },

    entities: conflictsToEntities(options.conflicts, options.factions),

    static_meshes: [
      {
        id: "arena_floor",
        asset: "assets/models/terrain/arena.gltf",
        material_intent: "sandstone",
        transform: {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        },
      },
    ],

    lights: [
      {
        type: "directional",
        direction: [0.45, -0.85, 0.35],
        color: [1.0, 0.96, 0.88],
        intensity: 1.5,
      },
    ],

    post_processing: {
      tonemap: "aces",
      exposure: 1.05,
      bloom_intensity: 0.35,
      contrast: 1.0,
      saturation: 1.0,
    },

    camera_default: {
      position: [0, 30, 30],
      target: [0, 0, 0],
    },
  };
}
