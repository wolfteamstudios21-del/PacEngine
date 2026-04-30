import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePacData } from "./pacdata-parser.js";

describe("parsePacData — v7 compatibility", () => {
  it("accepts format/version alias and camelCase pacCoreVersion", () => {
    const raw = JSON.stringify({
      format: "pacai_pacdata_v7",
      pacCoreVersion: "3.5",
      world: { name: "test" },
      entities: [{ id: "unit_01", type: "agent" }],
    });
    const doc = parsePacData(raw);
    assert.equal(doc.pacdataVersion, "pacai_pacdata_v7");
    assert.equal(doc.paccoreVersion, "3.5");
    assert.equal(doc.entities.length, 1);
    assert.equal(doc.entities[0].id, "unit_01");
  });

  it("accepts top-level entities array when world.entities is absent", () => {
    const raw = JSON.stringify({
      version: "1.0.0",
      pacCoreVersion: "3.5",
      world: { name: "arena" },
      entities: [
        { id: "tank_01", type: "agent" },
        { id: "barrel_01", type: "prop" },
      ],
    });
    const doc = parsePacData(raw);
    assert.equal(doc.entities.length, 2);
    assert.equal(doc.entities[0].id, "tank_01");
    assert.equal(doc.agentCount, 1);
  });

  it("prefers world.entities over root entities when both present", () => {
    const raw = JSON.stringify({
      format: "pacai_pacdata_v7",
      pacCoreVersion: "3.0",
      world: {
        name: "overlap",
        entities: [{ id: "world_ent", type: "agent" }],
      },
      entities: [{ id: "root_ent", type: "prop" }],
    });
    const doc = parsePacData(raw);
    assert.equal(doc.entities.length, 1);
    assert.equal(doc.entities[0].id, "world_ent");
  });

  it("converts numeric entity id to string", () => {
    const raw = JSON.stringify({
      pacdata_version: "1.0.0",
      paccore_version: "3.0.0",
      world: { name: "num_ids", entities: [{ id: 42, type: "prop" }] },
    });
    const doc = parsePacData(raw);
    assert.equal(doc.entities[0].id, "42");
  });

  it("accepts top-level conflictSim (camelCase, v7)", () => {
    const raw = JSON.stringify({
      format: "pacai_pacdata_v7",
      pacCoreVersion: "3.5",
      world: { name: "battle" },
      entities: [{ id: "e1", type: "agent" }],
      conflictSim: {
        enabled: true,
        scenarios: [{ id: "s1" }, { id: "s2" }],
      },
    });
    const doc = parsePacData(raw);
    assert.equal(doc.conflictSim.enabled, true);
    assert.equal(doc.conflictSim.scenarios.length, 2);
    assert.equal(doc.conflictSim.scenarios[0].id, "s1");
  });

  it("throws structured error when no entities array found", () => {
    const raw = JSON.stringify({
      format: "pacai_pacdata_v7",
      pacCoreVersion: "3.5",
      world: { name: "empty" },
    });
    assert.throws(
      () => parsePacData(raw),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(
          err.message,
          /Expected world\.entities or top-level entities array/,
        );
        return true;
      },
    );
  });

  it("throws structured error when entity id is not string or number", () => {
    const raw = JSON.stringify({
      format: "pacai_pacdata_v7",
      pacCoreVersion: "3.5",
      world: { name: "bad_ids", entities: [{ id: { nested: true }, type: "prop" }] },
    });
    assert.throws(
      () => parsePacData(raw),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Entity id must be a string or number/);
        return true;
      },
    );
  });

  it("handles classic pacdata_version / paccore_version (regression)", () => {
    const raw = JSON.stringify({
      pacdata_version: "1.0.0",
      paccore_version: "3.0.0",
      world: {
        name: "classic_world",
        entities: [{ id: "agent_01", type: "agent" }],
        conflict_sim: { enabled: false, scenarios: [] },
      },
    });
    const doc = parsePacData(raw);
    assert.equal(doc.pacdataVersion, "1.0.0");
    assert.equal(doc.paccoreVersion, "3.0.0");
    assert.equal(doc.worldName, "classic_world");
    assert.equal(doc.conflictSim.enabled, false);
  });
});
