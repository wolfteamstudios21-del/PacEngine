import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseVisualManifest, VisualManifestParseError } from "./visual-manifest.js";

describe("parseVisualManifest — v7 compatibility", () => {
  it("accepts version alias for visual_version", () => {
    const raw = JSON.stringify({
      version: "1.0.0",
      entities: [],
    });
    const result = parseVisualManifest(raw);
    assert.equal(result.visual_version, "1.0.0");
  });

  it("accepts postfx alias for post_processing", () => {
    const raw = JSON.stringify({
      version: "1.0.0",
      entities: [],
      postfx: { tonemap: "aces", exposure: 1.2 },
    });
    const result = parseVisualManifest(raw);
    assert.ok(result.post_processing);
    assert.equal((result.post_processing as Record<string, unknown>).tonemap, "aces");
  });

  it("accepts camera_defaults alias for camera_default", () => {
    const raw = JSON.stringify({
      version: "1.0.0",
      entities: [],
      camera_defaults: {
        position: [0, 10, 20],
        target: [0, 0, 0],
      },
    });
    const result = parseVisualManifest(raw);
    assert.ok(result.camera_default);
  });

  it("accepts string entity ids in entities array", () => {
    const raw = JSON.stringify({
      version: "1.0.0",
      entities: [
        { id: "unit_01", mesh: "models/tank.glb" },
        { id: "unit_02", mesh: "models/infantry.glb" },
      ],
    });
    const result = parseVisualManifest(raw);
    assert.equal(result.entities?.length, 2);
    assert.equal(result.entities?.[0].id, "unit_01");
  });

  it("accepts probe_density as numeric array (v7)", () => {
    const raw = JSON.stringify({
      version: "1.0.0",
      entities: [],
      global_illumination: {
        gi_type: "probe_grid",
        probe_density: [4, 4, 4],
      },
    });
    const result = parseVisualManifest(raw);
    assert.deepEqual(
      (result.global_illumination as Record<string, unknown>)?.probe_density,
      [4, 4, 4],
    );
  });

  it("accepts probe_density as string enum (classic)", () => {
    const raw = JSON.stringify({
      version: "1.0.0",
      entities: [],
      global_illumination: { gi_type: "probe_grid", probe_density: "high" },
    });
    const result = parseVisualManifest(raw);
    assert.equal(
      (result.global_illumination as Record<string, unknown>)?.probe_density,
      "high",
    );
  });

  it("flattens nested sky sub-object in environment", () => {
    const raw = JSON.stringify({
      version: "1.0.0",
      entities: [],
      environment: {
        sky: { type: "physical", sun_intensity: 1.5 },
        fog: { enabled: true, density: 0.01 },
      },
    });
    const result = parseVisualManifest(raw);
    const env = result.environment as Record<string, unknown> | undefined;
    assert.equal(env?.sky_type, "physical");
    assert.equal(env?.sun_intensity, 1.5);
    assert.equal(env?.fog_enabled, true);
    assert.equal(env?.fog_density, 0.01);
  });

  it("accepts manifest with no environment block (v7 minimal)", () => {
    const raw = JSON.stringify({
      version: "1.0.0",
      entities: [{ id: "e1", mesh: "models/unit.glb" }],
    });
    const result = parseVisualManifest(raw);
    assert.equal(result.visual_version, "1.0.0");
    assert.equal(result.environment, undefined);
  });

  it("accepts terrain and lights.shadows unknown keys without failing", () => {
    const terrain = { heightmap: "terrain/hm.png", scale: [100, 10, 100] };
    const raw = JSON.stringify({
      version: "1.0.0",
      entities: [],
      terrain,
      lights: [
        {
          type: "directional",
          intensity: 1.0,
          shadows: { enabled: true, distance: 200 },
        },
      ],
    });
    const result = parseVisualManifest(raw);
    assert.ok(result.lights?.length === 1);
    assert.equal((result.lights?.[0] as Record<string, unknown>).intensity, 1.0);
    // passthrough() must preserve the unknown terrain block unchanged
    assert.deepEqual((result as Record<string, unknown>).terrain, terrain);
    // shadows sub-object on a light must also be preserved
    assert.deepEqual(
      (result.lights?.[0] as Record<string, unknown>).shadows,
      { enabled: true, distance: 200 },
    );
  });

  it("throws VisualManifestParseError for invalid JSON", () => {
    assert.throws(
      () => parseVisualManifest("not json{"),
      (err: unknown) => {
        assert.ok(err instanceof VisualManifestParseError);
        assert.match(err.message, /parse failed/);
        return true;
      },
    );
  });

  it("accepts classic visual_version (regression)", () => {
    const raw = JSON.stringify({
      visual_version: "1.0.0",
      environment: { sky_type: "physical", fog_enabled: false },
      entities: [{ id: 0, render: { asset: "models/tank.glb" } }],
    });
    const result = parseVisualManifest(raw);
    assert.equal(result.visual_version, "1.0.0");
    assert.equal(result.entities?.[0].id, 0);
  });
});
