import { deterministicAccentColor } from "./pacdata-parser";

export interface TemplateSpec {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  pacdata: unknown;
}

export const TEMPLATES: TemplateSpec[] = [
  {
    id: "empty_world",
    name: "Empty World",
    category: "Sandbox",
    tagline: "A bare world with no entities or scenarios.",
    description:
      "A clean PacData document you can populate from scratch. Useful as a starting point for hand-authoring entities or wiring in a custom ConflictSim configuration.",
    pacdata: {
      pacdata_version: "1.0.0",
      paccore_version: "3.0.0",
      world: {
        name: "empty_world",
        shards: [],
        entities: [],
        gms: [],
        conflict_sim: { enabled: false, scenarios: [] },
      },
    },
  },
  {
    id: "single_agent_demo",
    name: "Single Agent Demo",
    category: "Demo",
    tagline: "One agent, deterministic ticks. The classic PacEngine smoke test.",
    description:
      "A single agent in an otherwise empty world. Each tick produces an 'Agent moved' event in the engine's event log. Run it twice to verify byte-exact determinism.",
    pacdata: {
      pacdata_version: "1.0.0",
      paccore_version: "3.0.0",
      world: {
        name: "single_agent_demo",
        entities: [{ id: 1, type: "agent" }],
        conflict_sim: { enabled: true },
      },
    },
  },
  {
    id: "multi_agent_sandbox",
    name: "Multi-Agent Sandbox",
    category: "Sandbox",
    tagline: "Five agents and a couple of landmarks for free-form experiments.",
    description:
      "A larger sandbox world with multiple named agents and landmark entities. ConflictSim is enabled with a single skirmish scenario so you can immediately exercise the conflict pipeline.",
    pacdata: {
      pacdata_version: "1.0.0",
      paccore_version: "3.0.0",
      world: {
        name: "multi_agent_sandbox",
        shards: [],
        entities: [
          { id: "agent_alpha", type: "agent" },
          { id: "agent_beta", type: "agent" },
          { id: "agent_gamma", type: "agent" },
          { id: "agent_delta", type: "agent" },
          { id: "agent_epsilon", type: "agent" },
          { id: "beacon_north", type: "landmark" },
          { id: "beacon_south", type: "landmark" },
        ],
        gms: [],
        conflict_sim: {
          enabled: true,
          scenarios: [{ id: "scenario_skirmish" }],
        },
      },
    },
  },
  {
    id: "conflict_arena",
    name: "ConflictSim Showcase",
    category: "Simulation",
    tagline: "Three champions, three conflict scenarios, one arena.",
    description:
      "A showcase project for the ConflictSim subsystem: three agent champions and a terrain entity, with three pre-wired scenarios (duel, three-way brawl, red-vs-world). Designed to make ConflictSim event traffic visible in the editor's console.",
    pacdata: {
      pacdata_version: "1.0.0",
      paccore_version: "3.0.0",
      world: {
        name: "conflict_arena",
        shards: [],
        entities: [
          { id: "champion_red", type: "agent" },
          { id: "champion_blue", type: "agent" },
          { id: "champion_green", type: "agent" },
          { id: "arena_floor", type: "terrain" },
        ],
        gms: [],
        conflict_sim: {
          enabled: true,
          scenarios: [
            { id: "scenario_duel_red_blue" },
            { id: "scenario_three_way_brawl" },
            { id: "scenario_red_vs_world" },
          ],
        },
      },
    },
  },
];

export function getTemplate(id: string): TemplateSpec | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function templateToApi(t: TemplateSpec) {
  const world = (t.pacdata as { world: { entities?: unknown[]; conflict_sim?: { scenarios?: unknown[] } } }).world;
  const entities = Array.isArray(world.entities) ? world.entities : [];
  const agentCount = entities.filter(
    (e) => (e as { type?: string }).type === "agent",
  ).length;
  const scenarios = Array.isArray(world.conflict_sim?.scenarios)
    ? world.conflict_sim!.scenarios!
    : [];
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    tagline: t.tagline,
    description: t.description,
    entityCount: entities.length,
    agentCount,
    scenarioCount: scenarios.length,
    accentColor: deterministicAccentColor(t.id),
  };
}
