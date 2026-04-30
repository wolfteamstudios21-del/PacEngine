import type { PacEngineExportOptions } from "./types.js";

// ─── world.pacdata.json builder ───────────────────────────────────────────────

export function buildPacData(options: PacEngineExportOptions): Record<string, unknown> {
  return {
    pacdata_version: "1.1.0",
    paccore_version: "3.0.0",
    world: {
      name: `conflict_world_${options.projectId}`,
      seed: options.seed,
      description: options.description,

      entities: buildEntities(options),

      conflict_sim: {
        enabled: true,
        version: "v2",
        zones: options.zones,
        factions: options.factions,
        active_conflicts: options.conflicts,
        history: options.conflictSnapshot.history ?? [],
        npc_memory: options.conflictSnapshot.npcMemory ?? {},
        director_state: options.conflictSnapshot.directorState ?? {},
        motion_profile: options.motionProfile ?? null,
      },

      // Shard layout — expanded in M3 with multi-arena support.
      shards: [
        { id: "main", type: "conflict_arena", priority: 1 },
      ],

      behavior_graphs: buildBehaviorGraphs(options),
      gm_logic: buildGMLogic(options),
    },
  };
}

function buildEntities(options: PacEngineExportOptions): unknown[] {
  // Converts faction + conflict data into PacEngine entity descriptors.
  // Phase M3 — populate transform, components, AI graph references.
  return options.conflicts.map((conflict, index) => ({
    id: typeof conflict.id === "number" ? conflict.id : index + 1000,
    type: "npc_agent",
    faction: conflict.faction,
    zone: conflict.zone ?? "main",
    components: {
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      conflict: { type: conflict.type, severity: conflict.severity ?? 1 },
    },
  }));
}

function buildBehaviorGraphs(_options: PacEngineExportOptions): unknown[] {
  // Phase M3 — convert motionProfile + directorState into behavior nodes.
  return [];
}

function buildGMLogic(options: PacEngineExportOptions): Record<string, unknown> {
  return {
    pacing: options.conflictSnapshot.directorState?.pacing ?? "medium",
    scenario_type: "skirmish",
  };
}
